import {
  createPlatformApiClient,
  createPlatformSessionStore
} from "@evcp/api-client";

export function resolvePlatformApiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  if (!configured && import.meta.env.DEV) return undefined;
  return (configured || "/api").replace(/\/$/, "");
}

export function platformSessionToken(): string | undefined {
  return createPlatformSessionStore(window.localStorage).getToken();
}

export function createStorePlatformClient() {
  const baseUrl = resolvePlatformApiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
    legacyUserEmail: "user@company.com"
  });
}
