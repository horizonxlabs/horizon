import type { StoreAccessRequestResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { beginStoreKeycloakLogout, clearStoreSessionBridge, initialStoreBootstrap, loadStoreBootstrap, type StoreBootstrapState } from "./bootstrap";
import { createStoreDeviceState, type StoreDeviceSnapshot, type StoreDeviceStorage } from "./device-state";
import { createStorePlatformClient } from "./platform-client";
import { createStorefrontStateStore, type StorefrontStateStore } from "./store-state";
import type { StoreRefreshOptions, StoreRefreshResult } from "./store-async";

export type StorefrontContextValue = {
  bootstrap: StoreBootstrapState;
  logoutError?: string;
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
  runAppAction<T>(
    appSlug: string,
    action: StoreAppAction,
    mutation: () => Promise<T>,
    successMessage: string,
    onConfirmed?: (result: T) => void
  ): Promise<T>;
};

export type StorePlatformClient = Pick<ReturnType<typeof createStorePlatformClient>,
  "getStoreAppDetail" | "installStoreApp" | "uninstallStoreApp" | "requestStoreAccess" | "submitStoreTicket" | "getStoreTicket">;
export type StoreAppAction = "install" | "uninstall" | "request-access" | "submit-ticket";
export type StoreAppActionState = { pending: boolean; success?: string; error?: string };

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

export function StoreProvider({ children, store, client }: { children: ReactNode; store?: StorefrontStateStore; client?: StorePlatformClient }) {
  const defaultStore = useRef<StorefrontStateStore | undefined>(undefined);
  const defaultClient = useRef<StorePlatformClient | undefined>(undefined);
  const mounted = useRef(true);
  const inflightActions = useRef(new Map<string, Promise<unknown>>());
  const [actionStates, setActionStates] = useState<Record<string, StoreAppActionState>>({});
  if (!defaultStore.current) defaultStore.current = createDefaultStore();
  if (!client && !defaultClient.current) defaultClient.current = createLazyStorePlatformClient();
  const stateStore = store ?? defaultStore.current;
  const api = client ?? defaultClient.current!;
  const state = useSyncExternalStore(stateStore.subscribe, stateStore.getSnapshot, stateStore.getSnapshot);

  useEffect(() => {
    mounted.current = true;
    stateStore.mount();
    return () => {
      mounted.current = false;
      stateStore.unmount();
    };
  }, [stateStore]);

  const refreshHome = useCallback((options?: StoreRefreshOptions) => stateStore.refresh(options), [stateStore]);
  const logout = useCallback(() => stateStore.logout(), [stateStore]);
  const runAppAction = useCallback(<T,>(
    appSlug: string,
    action: StoreAppAction,
    mutation: () => Promise<T>,
    successMessage: string,
    onConfirmed?: (result: T) => void
  ): Promise<T> => {
    const key = storeAppActionKey(appSlug, action);
    const existing = inflightActions.current.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const update = (next: StoreAppActionState) => {
      if (mounted.current) setActionStates((states) => ({ ...states, [key]: next }));
    };
    let request: Promise<T>;
    request = (async () => {
      update({ pending: true });
      try {
        const result = await mutation();
        onConfirmed?.(result);
        update({ pending: false, success: successMessage });
        const refresh = await refreshHome({ preserveReadyOnFailure: true });
        if (!refresh.ok) update({
          pending: false,
          success: `${successMessage} Store home refresh failed: ${refresh.error.message}`
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "The action could not be completed.";
        update({ pending: false, error: message });
        throw error;
      } finally {
        inflightActions.current.delete(key);
      }
    })();
    inflightActions.current.set(key, request);
    return request;
  }, [refreshHome]);
  const value = useMemo<StorefrontContextValue>(() => ({
    bootstrap: state.bootstrap,
    logoutError: state.logoutError,
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
    runAppAction
  }), [actionStates, api, logout, refreshHome, runAppAction, state, stateStore]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used within StoreProvider.");
  return context;
}
