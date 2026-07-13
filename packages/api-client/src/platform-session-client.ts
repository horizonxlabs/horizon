import { createPlatformApiClient, type PlatformApiClient, type PlatformApiClientOptions } from "./index";
import { PlatformSessionStore, type PlatformSessionStorage, type PlatformSessionTokenPair } from "./platform-session-store";

type RefreshResponse = { ok: true; data: PlatformSessionTokenPair } | { ok: false };

export type SessionAwarePlatformApiClientOptions = Omit<PlatformApiClientOptions, "sessionToken" | "fetcher"> & {
  storage: PlatformSessionStorage;
  /** Called after a rejected/reused refresh token has been removed from local storage. */
  onSessionEnded?: () => void;
  refreshLeewayMs?: number;
  fetcher?: typeof fetch;
};

/**
 * Creates a normal PlatformApiClient whose Authorization header follows the rotating browser
 * session. It refreshes once before an imminent expiry or after one 401, then fails closed.
 */
export function createSessionAwarePlatformApiClient(
  options: SessionAwarePlatformApiClientOptions
): PlatformApiClient {
  const { storage, onSessionEnded, refreshLeewayMs = 60_000, fetcher = globalThis.fetch.bind(globalThis), ...clientOptions } = options;
  const sessions = new PlatformSessionStore(storage);
  let refreshInFlight: Promise<boolean> | undefined;
  let sessionEnded = false;

  const endSession = () => {
    if (sessionEnded) return;
    sessionEnded = true;
    sessions.clearSession();
    onSessionEnded?.();
  };

  const refresh = async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const refreshToken = sessions.getRefreshToken();
      const refreshExpiresAt = sessions.getRefreshExpiresAt();
      if (!refreshToken || !refreshExpiresAt || Date.parse(refreshExpiresAt) <= Date.now()) {
        endSession();
        return false;
      }
      try {
        const response = await fetcher(`${clientOptions.baseUrl.replace(/\/$/, "")}/auth/refresh`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
        const payload = (await response.json().catch(() => undefined)) as RefreshResponse | undefined;
        if (!response.ok || !payload || !payload.ok || !payload.data?.token || !payload.data.refreshToken) {
          endSession();
          return false;
        }
        sessions.saveSession(payload.data);
        return true;
      } catch {
        endSession();
        return false;
      } finally {
        refreshInFlight = undefined;
      }
    })();
    return refreshInFlight;
  };

  const authenticatedFetch: typeof fetch = async (input, init) => {
    const expiresAt = sessions.getExpiresAt();
    if (expiresAt && Date.parse(expiresAt) - Date.now() <= refreshLeewayMs) await refresh();
    const send = async () => {
      const headers = new Headers(init?.headers);
      const token = sessions.getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetcher(input, { ...init, headers });
    };
    let response = await send();
    if (response.status === 401 && await refresh()) response = await send();
    return response;
  };

  return createPlatformApiClient({ ...clientOptions, fetcher: authenticatedFetch });
}
