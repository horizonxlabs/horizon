import type { StoreAccessRequestResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { beginStoreKeycloakLogout, clearStoreSessionBridge, initialStoreBootstrap, loadStoreBootstrap, type StoreBootstrapState } from "./bootstrap";
import { createStoreDeviceState, type StoreDeviceSnapshot, type StoreDeviceStorage } from "./device-state";
import { createStorePlatformClient } from "./platform-client";

export type StorefrontContextValue = {
  bootstrap: StoreBootstrapState;
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
  const mounted = useRef(true);
  const refreshSequence = useRef(0);
  const [bootstrap, setBootstrap] = useState(initialStoreBootstrap);
  const [device, setDevice] = useState(() => repository.current.read());

  const refreshHome = useCallback(async () => {
    if (!mounted.current) return;
    const sequence = ++refreshSequence.current;
    setBootstrap((current) => ({ ...current, status: "loading", error: undefined }));
    try {
      const next = await loadStoreBootstrap();
      if (mounted.current && sequence === refreshSequence.current) setBootstrap(next);
    } catch (error) {
      if (!mounted.current || sequence !== refreshSequence.current) return;
      setBootstrap({
        ...initialStoreBootstrap,
        status: "error",
        error: error instanceof Error ? error.message : "Unable to load your Store account."
      });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshHome();
    return () => {
      mounted.current = false;
      refreshSequence.current += 1;
    };
  }, [refreshHome]);

  const updateDevice = useCallback((update: () => void) => {
    update();
    setDevice(repository.current.read());
  }, []);

  const logout = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      await createStorePlatformClient().request("/auth/logout", { method: "POST" });
    } catch (error) {
      if (mounted.current && sequence === refreshSequence.current) {
        setBootstrap({
          ...initialStoreBootstrap,
          status: "error",
          error: error instanceof Error ? error.message : "Unable to sign out securely."
        });
      }
      return;
    }
    if (!mounted.current || sequence !== refreshSequence.current) return;
    setBootstrap(clearStoreSessionBridge());
    beginStoreKeycloakLogout();
  }, []);

  const value = useMemo<StorefrontContextValue>(() => ({
    bootstrap,
    allApps: mergeApps(bootstrap),
    device,
    refreshHome,
    toggleFavorite: (appSlug) => updateDevice(() => repository.current.toggleFavorite(appSlug)),
    recordRecent: (appSlug) => updateDevice(() => repository.current.recordRecent(appSlug)),
    rememberTicket: (ticketId) => updateDevice(() => repository.current.rememberTicket(ticketId)),
    rememberAccessReceipt: (receipt) => updateDevice(() => repository.current.rememberAccessReceipt(receipt)),
    clearDevicePreferences: () => updateDevice(() => repository.current.clear()),
    logout
  }), [bootstrap, device, logout, refreshHome, updateDevice]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used within StoreProvider.");
  return context;
}
