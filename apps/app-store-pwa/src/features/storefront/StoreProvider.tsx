import type { StoreAccessRequestResponse, StoreAppInstallationResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import {
  beginStoreKeycloakLogout,
  clearStoreSessionBridge,
  initialStoreBootstrap,
  loadStoreBootstrap,
  type StoreBootstrapState
} from "./bootstrap";
import {
  createStoreDeviceState,
  type StoreDeviceSnapshot,
  type StoreDeviceStorage
} from "./device-state";
import { createStorePlatformClient } from "./platform-client";
import { createStorefrontStateStore, type StorefrontStateStore } from "./store-state";
import type { StoreRefreshOptions, StoreRefreshResult } from "./store-async";

export type StorefrontContextValue = {
  bootstrap: StoreBootstrapState;
  logoutError?: string;
  homeRevision: number;
  allApps: AppStoreItem[];
  device: StoreDeviceSnapshot;
  refreshHome(options?: StoreRefreshOptions): Promise<StoreRefreshResult>;
  toggleFavorite(appSlug: string): void;
  recordRecent(appSlug: string): void;
  rememberTicket(ticketId: string): void;
  rememberAccessReceipt(receipt: StoreAccessRequestResponse): void;
  clearDevicePreferences(): boolean;
  logout(): Promise<void>;
  api: StorePlatformClient;
  actionStates: Record<string, StoreAppActionState>;
  reconcileInstallationEvidenceForSlug(appSlug: string): void;
  runAppAction<T>(
    appSlug: string,
    action: StoreAppAction,
    mutation: () => Promise<T>,
    successMessage: string,
    onConfirmed?: (result: T) => void
  ): Promise<T>;
};

export type StorePlatformClient = Pick<
  ReturnType<typeof createStorePlatformClient>,
  | "getStoreAppDetail"
  | "authorizeStoreAppLaunch"
  | "installStoreApp"
  | "uninstallStoreApp"
  | "requestStoreAccess"
  | "submitStoreTicket"
  | "getStoreTicket"
>;
export type StoreAppAction = "install" | "uninstall" | "request-access" | "submit-ticket";
export type StoreAppActionState = {
  pending: boolean;
  sequence: number;
  success?: string;
  error?: string;
  installationStatus?: StoreAppInstallationResponse["status"];
};

function confirmedInstallationStatus(
  action: StoreAppAction,
  result: unknown
): StoreAppInstallationResponse["status"] | undefined {
  if (action !== "install" && action !== "uninstall") return undefined;
  if (!result || typeof result !== "object") return undefined;
  const status = (result as { status?: unknown }).status;
  return status === "active" || status === "disabled" ? status : undefined;
}

export function storeAppActionKey(appSlug: string, action: StoreAppAction): string {
  return `${action}:${encodeURIComponent(appSlug.trim().toLocaleLowerCase())}`;
}

const StorefrontContext = createContext<StorefrontContextValue | undefined>(undefined);

function deviceStorage(): StoreDeviceStorage {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

function mergeApps(bootstrap: StoreBootstrapState): AppStoreItem[] {
  const seen = new Set<string>();
  return [...bootstrap.myApps, ...bootstrap.availableApps].filter((app) => {
    if (seen.has(app.slug)) return false;
    seen.add(app.slug);
    return true;
  });
}

function clearCompletedInstallationEvidence(
  state: StoreAppActionState | undefined
): StoreAppActionState | undefined {
  if (!state || state.pending || !state.installationStatus) return state;
  const feedback = { ...state };
  delete feedback.installationStatus;
  return feedback;
}

function createDefaultStore(): StorefrontStateStore {
  return createStorefrontStateStore({
    initialBootstrap: initialStoreBootstrap,
    loadHome: loadStoreBootstrap,
    logout: () => createStorePlatformClient().request("/auth/logout", { method: "POST" }),
    device: createStoreDeviceState(deviceStorage()),
    onLogoutSuccess: () => {
      const bootstrap = clearStoreSessionBridge();
      beginStoreKeycloakLogout();
      return bootstrap;
    }
  });
}

function createLazyStorePlatformClient(): StorePlatformClient {
  return {
    getStoreAppDetail(...args) {
      return createStorePlatformClient().getStoreAppDetail(...args);
    },
    authorizeStoreAppLaunch(...args) {
      return createStorePlatformClient().authorizeStoreAppLaunch(...args);
    },
    installStoreApp(...args) {
      return createStorePlatformClient().installStoreApp(...args);
    },
    uninstallStoreApp(...args) {
      return createStorePlatformClient().uninstallStoreApp(...args);
    },
    requestStoreAccess(...args) {
      return createStorePlatformClient().requestStoreAccess(...args);
    },
    submitStoreTicket(...args) {
      return createStorePlatformClient().submitStoreTicket(...args);
    },
    getStoreTicket(...args) {
      return createStorePlatformClient().getStoreTicket(...args);
    }
  };
}

export function StoreProvider({
  children,
  store,
  client
}: {
  children: ReactNode;
  store?: StorefrontStateStore;
  client?: StorePlatformClient;
}) {
  const defaultStore = useRef<StorefrontStateStore | undefined>(undefined);
  const defaultClient = useRef<StorePlatformClient | undefined>(undefined);
  const mounted = useRef(true);
  const inflightActions = useRef(new Map<string, Promise<unknown>>());
  const actionSequence = useRef(0);
  const [actionStates, setActionStates] = useState<Record<string, StoreAppActionState>>({});
  const [homeRevision, setHomeRevision] = useState(0);
  if (!defaultStore.current) defaultStore.current = createDefaultStore();
  if (!client && !defaultClient.current) defaultClient.current = createLazyStorePlatformClient();
  const stateStore = store ?? defaultStore.current;
  const api = client ?? defaultClient.current!;
  const state = useSyncExternalStore(
    stateStore.subscribe,
    stateStore.getSnapshot,
    stateStore.getSnapshot
  );

  useEffect(() => {
    mounted.current = true;
    stateStore.mount();
    return () => {
      mounted.current = false;
      stateStore.unmount();
    };
  }, [stateStore]);

  const reconcileInstallationEvidenceForSlugs = useCallback((appSlugs: Iterable<string>) => {
    if (!mounted.current) return;
    const keys = [...appSlugs].flatMap((appSlug) => [
      storeAppActionKey(appSlug, "install"),
      storeAppActionKey(appSlug, "uninstall")
    ]);
    setActionStates((states) => {
      let changed = false;
      const next = { ...states };
      for (const key of keys) {
        const reconciled = clearCompletedInstallationEvidence(states[key]);
        if (reconciled !== states[key]) {
          next[key] = reconciled!;
          changed = true;
        }
      }
      return changed ? next : states;
    });
  }, []);
  const reconcileInstallationEvidenceForSlug = useCallback(
    (appSlug: string) => {
      reconcileInstallationEvidenceForSlugs([appSlug]);
    },
    [reconcileInstallationEvidenceForSlugs]
  );
  const refreshHome = useCallback(
    async (options?: StoreRefreshOptions) => {
      const result = await stateStore.refresh(options);
      if (result.ok && result.applied) {
        reconcileInstallationEvidenceForSlugs(
          mergeApps(stateStore.getSnapshot().bootstrap).map((app) => app.slug)
        );
        setHomeRevision((current) => current + 1);
      }
      return result;
    },
    [reconcileInstallationEvidenceForSlugs, stateStore]
  );
  const logout = useCallback(() => stateStore.logout(), [stateStore]);
  const runAppAction = useCallback(
    <T,>(
      appSlug: string,
      action: StoreAppAction,
      mutation: () => Promise<T>,
      successMessage: string,
      onConfirmed?: (result: T) => void
    ): Promise<T> => {
      const key = storeAppActionKey(appSlug, action);
      const existing = inflightActions.current.get(key) as Promise<T> | undefined;
      if (existing) return existing;
      const sequence = ++actionSequence.current;
      const update = (next: StoreAppActionState) => {
        if (mounted.current) setActionStates((states) => ({ ...states, [key]: next }));
      };
      let request: Promise<T>;
      request = (async () => {
        update({ pending: true, sequence });
        try {
          const result = await mutation();
          onConfirmed?.(result);
          const installationStatus = confirmedInstallationStatus(action, result);
          const confirmedState: StoreAppActionState = {
            pending: false,
            sequence,
            success: successMessage,
            ...(installationStatus ? { installationStatus } : {})
          };
          update(confirmedState);
          const refresh = await refreshHome({ preserveReadyOnFailure: true });
          if (!refresh.ok)
            update({
              ...confirmedState,
              success: `${successMessage} Store home refresh failed: ${refresh.error.message}`
            });
          return result;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "The action could not be completed.";
          update({ pending: false, sequence, error: message });
          throw error;
        } finally {
          inflightActions.current.delete(key);
        }
      })();
      inflightActions.current.set(key, request);
      return request;
    },
    [refreshHome]
  );
  const value = useMemo<StorefrontContextValue>(
    () => ({
      bootstrap: state.bootstrap,
      logoutError: state.logoutError,
      homeRevision,
      allApps: mergeApps(state.bootstrap),
      device: state.device,
      refreshHome,
      toggleFavorite: stateStore.toggleFavorite,
      recordRecent: stateStore.recordRecent,
      rememberTicket: stateStore.rememberTicket,
      rememberAccessReceipt: stateStore.rememberAccessReceipt,
      clearDevicePreferences: stateStore.clearDevicePreferences,
      logout,
      api,
      actionStates,
      reconcileInstallationEvidenceForSlug,
      runAppAction
    }),
    [
      actionStates,
      api,
      homeRevision,
      logout,
      reconcileInstallationEvidenceForSlug,
      refreshHome,
      runAppAction,
      state,
      stateStore
    ]
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used within StoreProvider.");
  return context;
}
