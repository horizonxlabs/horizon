import type { StoreAccessRequestResponse } from "@evcp/api-client";
import type { StoreBootstrapState } from "./bootstrap";
import type { StoreDeviceSnapshot } from "./device-state";
import { createStorefrontAsyncController } from "./store-async";

export type StoreDeviceRepository = {
  read(): StoreDeviceSnapshot;
  toggleFavorite(appSlug: string): void;
  recordRecent(appSlug: string): void;
  rememberTicket(ticketId: string): void;
  rememberAccessReceipt(receipt: StoreAccessRequestResponse): void;
  clear(): void;
};

export type StorefrontState = {
  bootstrap: StoreBootstrapState;
  device: StoreDeviceSnapshot;
  logoutError?: string;
};

export type StorefrontStateStore = {
  getSnapshot(): StorefrontState;
  subscribe(listener: () => void): () => void;
  mount(): void;
  unmount(): void;
  refresh(): Promise<void>;
  logout(): Promise<void>;
  toggleFavorite(appSlug: string): void;
  recordRecent(appSlug: string): void;
  rememberTicket(ticketId: string): void;
  rememberAccessReceipt(receipt: StoreAccessRequestResponse): void;
  clearDevicePreferences(): void;
};

export function createStorefrontStateStore({
  initialBootstrap,
  loadHome,
  logout = async () => undefined,
  device,
  onLogoutSuccess = () => undefined
}: {
  initialBootstrap: StoreBootstrapState;
  loadHome(): Promise<StoreBootstrapState>;
  logout?(): Promise<void>;
  device: StoreDeviceRepository;
  onLogoutSuccess(): StoreBootstrapState | void;
}): StorefrontStateStore {
  let state: StorefrontState = { bootstrap: initialBootstrap, device: device.read() };
  const listeners = new Set<() => void>();
  const publish = (next: StorefrontState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const syncDevice = () => publish({ ...state, device: device.read() });
  const controller = createStorefrontAsyncController({
    loadHome,
    logout,
    onRefreshStart: () => publish({
      ...state,
      bootstrap: { ...state.bootstrap, status: "loading", error: undefined }
    }),
    onRefreshSuccess: (bootstrap) => publish({ ...state, bootstrap }),
    onRefreshFailure: (error) => publish({
      ...state,
      bootstrap: { ...initialBootstrap, status: "error", error: error.message }
    }),
    onLogoutStart: () => publish({ ...state, logoutError: undefined }),
    onLogoutFailure: (error) => publish({ ...state, logoutError: error.message }),
    onLogoutSuccess: () => {
      const bootstrap = onLogoutSuccess();
      if (bootstrap) publish({ ...state, bootstrap });
    }
  });

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mount() {
      controller.mount();
      void controller.refresh();
    },
    unmount: controller.unmount,
    refresh: controller.refresh,
    logout: controller.logout,
    toggleFavorite(appSlug) {
      device.toggleFavorite(appSlug);
      syncDevice();
    },
    recordRecent(appSlug) {
      device.recordRecent(appSlug);
      syncDevice();
    },
    rememberTicket(ticketId) {
      device.rememberTicket(ticketId);
      syncDevice();
    },
    rememberAccessReceipt(receipt) {
      device.rememberAccessReceipt(receipt);
      syncDevice();
    },
    clearDevicePreferences() {
      device.clear();
      syncDevice();
    }
  };
}
