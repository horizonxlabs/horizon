import { useSyncExternalStore } from "react";

const STORE_NAVIGATION_EVENT = "evcp:navigate";

function readLocationSearch(): string {
  return typeof window === "undefined" ? "" : (window.location.search ?? "");
}

function subscribeToLocationSearch(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(STORE_NAVIGATION_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(STORE_NAVIGATION_EVENT, onStoreChange);
  };
}

export function useStoreLocationSearch(): string {
  return useSyncExternalStore(subscribeToLocationSearch, readLocationSearch, () => "");
}
