import {
  createPlatformApiClient,
  createSessionAwareFetch,
  type PlatformApiClientOptions
} from "@evcp/api-client";

export function createConfiguredPlatformApiClient(
  configuration: Omit<PlatformApiClientOptions, "baseUrl" | "sessionToken" | "fetcher"> & { onSessionEnded?: () => void } = {}
) {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  const baseUrl = (configured || "/api").replace(/\/$/, "");
  const { onSessionEnded, ...clientConfiguration } = configuration;
  return createPlatformApiClient({
    baseUrl,
    ...clientConfiguration,
    fetcher: createSessionAwareFetch({ baseUrl, storage: window.localStorage, onSessionEnded })
  });
}
