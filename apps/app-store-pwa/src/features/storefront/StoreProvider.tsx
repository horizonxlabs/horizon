import type { StoreAccessRequestResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { beginStoreKeycloakLogout, clearStoreSessionBridge, initialStoreBootstrap, loadStoreBootstrap, type StoreBootstrapState } from "./bootstrap";
import { createStoreDeviceState, type StoreDeviceSnapshot, type StoreDeviceStorage } from "./device-state";
import { createStorePlatformClient } from "./platform-client";
import { createStorefrontAsyncController } from "./store-async";

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const repository = useRef(createStoreDeviceState(deviceStorage()));
  const [bootstrap, setBootstrap] = useState(initialStoreBootstrap);
  const [device, setDevice] = useState(() => repository.current.read());
  const [logoutError, setLogoutError] = useState<string>();
  const controller = useRef<ReturnType<typeof createStorefrontAsyncController<StoreBootstrapState>>>(undefined);

  if (!controller.current) {
    controller.current = createStorefrontAsyncController({
      loadHome: loadStoreBootstrap,
      logout: () => createStorePlatformClient().request("/auth/logout", { method: "POST" }),
      onRefreshStart: () => setBootstrap((current) => ({ ...current, status: "loading", error: undefined })),
      onRefreshSuccess: setBootstrap,
      onRefreshFailure: (error) => setBootstrap({ ...initialStoreBootstrap, status: "error", error: error.message }),
      onLogoutStart: () => setLogoutError(undefined),
      onLogoutFailure: (error) => setLogoutError(error.message),
      onLogoutSuccess: () => {
        setBootstrap(clearStoreSessionBridge());
        beginStoreKeycloakLogout();
      }
    });
  }

  const refreshHome = useCallback(() => controller.current!.refresh(), []);

  useEffect(() => {
    controller.current!.mount();
    void refreshHome();
    return () => {
      controller.current!.unmount();
    };
  }, [refreshHome]);

  const updateDevice = useCallback((update: () => void) => {
    update();
    setDevice(repository.current.read());
  }, []);

  const logout = useCallback(() => controller.current!.logout(), []);

  const value = useMemo<StorefrontContextValue>(() => ({
    bootstrap,
    logoutError,
    allApps: mergeApps(bootstrap),
    device,
    refreshHome,
    toggleFavorite: (appSlug) => updateDevice(() => repository.current.toggleFavorite(appSlug)),
    recordRecent: (appSlug) => updateDevice(() => repository.current.recordRecent(appSlug)),
    rememberTicket: (ticketId) => updateDevice(() => repository.current.rememberTicket(ticketId)),
    rememberAccessReceipt: (receipt) => updateDevice(() => repository.current.rememberAccessReceipt(receipt)),
    clearDevicePreferences: () => updateDevice(() => repository.current.clear()),
    logout
  }), [bootstrap, device, logout, logoutError, refreshHome, updateDevice]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used within StoreProvider.");
  return context;
}
