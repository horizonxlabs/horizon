import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type PlatformApiClientOptions
} from "@evcp/api-client";

export function createConfiguredPlatformApiClient(
  configuration: Omit<PlatformApiClientOptions, "baseUrl" | "sessionToken"> = {}
) {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  const baseUrl =
    !configured && import.meta.env.DEV ? undefined : (configured || "/api").replace(/\/$/, "");
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    sessionToken: createPlatformSessionStore(window.localStorage).getToken(),
    ...configuration
  });
}
