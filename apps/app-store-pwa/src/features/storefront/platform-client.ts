import { startKeycloakLogin, startKeycloakLogout } from "@evcp/api-client";
import { createConfiguredPlatformApiClient } from "@/shared/platform-client";

export function createStorePlatformClient() {
  return createConfiguredPlatformApiClient();
}

export function startStoreKeycloakLogin(returnTo: string): string {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  return startKeycloakLogin((configured || "/api").replace(/\/$/, ""), "store", returnTo);
}

export function startStoreKeycloakLogout(returnTo: string): string {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  return startKeycloakLogout((configured || "/api").replace(/\/$/, ""), "store", returnTo);
}
