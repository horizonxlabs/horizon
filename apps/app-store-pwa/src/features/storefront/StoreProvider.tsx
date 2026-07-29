import type { StoreAccessRequestResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { beginStoreKeycloakLogout, clearStoreSessionBridge, initialStoreBootstrap, loadStoreBootstrap, type StoreBootstrapState } from "./bootstrap";
import { createStoreDeviceState, type StoreDeviceSnapshot, type StoreDeviceStorage } from "./device-state";
import { createStorePlatformClient } from "./platform-client";
import { createStorefrontStateStore, type StorefrontStateStore } from "./store-state";

export type StorefrontContextValue = {
  bootstrap: StoreBootstrapState;
  logoutError?: string;
  allApps: AppStoreItem[];
  device: StoreDeviceSnapshot;
  refreshHome(): Promise<void>;
  toggleFavorite(appSlug: string): void;
  recordRecent(appSlug: string): void;
  rememberTicket(ticketId: string): void;
  rememberAccessReceipt(receipt: StoreAccessRequestResponse): void;
  clearDevicePreferences(): void;
  logout(): Promise<void>;
};

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

export function StoreProvider({ children, store }: { children: ReactNode; store?: StorefrontStateStore }) {
  const defaultStore = useRef<StorefrontStateStore | undefined>(undefined);
  if (!defaultStore.current) defaultStore.current = createDefaultStore();
  const stateStore = store ?? defaultStore.current;
  const state = useSyncExternalStore(stateStore.subscribe, stateStore.getSnapshot, stateStore.getSnapshot);

  useEffect(() => {
    stateStore.mount();
    return stateStore.unmount;
  }, [stateStore]);

  const refreshHome = useCallback(() => stateStore.refresh(), [stateStore]);
  const logout = useCallback(() => stateStore.logout(), [stateStore]);
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
    logout
  }), [logout, refreshHome, state, stateStore]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used within StoreProvider.");
  return context;
}
