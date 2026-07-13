import {
  createPlatformApiClient,
  createSessionAwareFetch,
  type PlatformApiClientOptions
} from "@evcp/api-client";

export function createConfiguredPlatformApiClient(
  configuration: Omit<PlatformApiClientOptions, "baseUrl" | "sessionToken" | "fetcher"> & { onSessionEnded?: () => void } = {}
) {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  const baseUrl =
    !configured && import.meta.env.DEV ? undefined : (configured || "/api").replace(/\/$/, "");
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const { onSessionEnded, ...clientConfiguration } = configuration;
  return createPlatformApiClient({
    baseUrl,
    ...clientConfiguration,
    fetcher: createSessionAwareFetch({ baseUrl, storage: window.localStorage, onSessionEnded })
  });
}
