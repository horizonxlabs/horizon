import { PlatformSessionStore, type PlatformSessionStorage, type PlatformSessionTokenPair } from "./platform-session-store";

type RefreshResponse = { ok: true; data: PlatformSessionTokenPair } | { ok: false };
type PlatformSessionLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

export type SessionAwareFetchOptions = {
  baseUrl: string;
  storage: PlatformSessionStorage;
  /** Called after a rejected/reused refresh token has been removed from local storage. */
  onSessionEnded?: () => void;
  refreshLeewayMs?: number;
  fetcher?: typeof fetch;
  lockManager?: PlatformSessionLockManager;
};

type RefreshCoordinator = { inFlight?: Promise<boolean> };
const refreshCoordinators = new WeakMap<object, Map<string, RefreshCoordinator>>();

/**
 * Creates the browser fetcher for a rotating Platform session. It refreshes once before an
 * imminent expiry or after one 401, then fails closed. Keeping this module independent from the
 * API-client facade avoids an ESM circular import in Vite.
 */
export function createSessionAwareFetch(options: SessionAwareFetchOptions): typeof fetch {
  const {
    storage,
    onSessionEnded,
    refreshLeewayMs = 60_000,
    fetcher = globalThis.fetch.bind(globalThis),
    baseUrl,
    lockManager = browserLockManager()
  } = options;
  const sessions = new PlatformSessionStore(storage);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const refreshCoordinator = coordinatorFor(storage, normalizedBaseUrl);
  let sessionEnded = false;

  const endSession = () => {
    if (sessionEnded) return;
    sessionEnded = true;
    sessions.clearSession();
    onSessionEnded?.();
  };

  const refresh = async (staleAccessToken = sessions.getToken()): Promise<boolean> => {
    if (refreshCoordinator.inFlight) return refreshCoordinator.inFlight;
    const refreshOnce = async () => {
      const currentAccessToken = sessions.getToken();
      if (currentAccessToken && currentAccessToken !== staleAccessToken) return true;
      const refreshToken = sessions.getRefreshToken();
      const refreshExpiresAt = sessions.getRefreshExpiresAt();
      if (!refreshToken || !refreshExpiresAt || Date.parse(refreshExpiresAt) <= Date.now()) {
        endSession();
        return false;
      }
      try {
        const response = await fetcher(`${normalizedBaseUrl}/auth/refresh`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
        const payload = (await response.json().catch(() => undefined)) as RefreshResponse | undefined;
        if (!response.ok || !payload || !payload.ok || !payload.data?.token || !payload.data.refreshToken) {
          if (response.status === 400 || response.status === 401) endSession();
          return false;
        }
        sessions.saveSession(payload.data);
        return true;
      } catch {
        return false;
      } finally {
        refreshCoordinator.inFlight = undefined;
      }
    };
    refreshCoordinator.inFlight = lockManager
      ? lockManager.request(`evcp-platform-session-refresh:${normalizedBaseUrl}`, refreshOnce)
      : refreshOnce();
    return refreshCoordinator.inFlight;
  };

  const authenticatedFetch: typeof fetch = async (input, init) => {
    const expiresAt = sessions.getExpiresAt();
    if (expiresAt && Date.parse(expiresAt) - Date.now() <= refreshLeewayMs) {
      await refresh(sessions.getToken());
    }
    const send = async () => {
      const headers = new Headers(init?.headers);
      const token = sessions.getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return { response: await fetcher(input, { ...init, headers }), token };
    };
    let { response, token } = await send();
    if (response.status === 401 && await refresh(token)) ({ response } = await send());
    return response;
  };

  return authenticatedFetch;
}

function coordinatorFor(storage: PlatformSessionStorage, baseUrl: string): RefreshCoordinator {
  let byBaseUrl = refreshCoordinators.get(storage);
  if (!byBaseUrl) {
    byBaseUrl = new Map();
    refreshCoordinators.set(storage, byBaseUrl);
  }
  let coordinator = byBaseUrl.get(baseUrl);
  if (!coordinator) {
    coordinator = {};
    byBaseUrl.set(baseUrl, coordinator);
  }
  return coordinator;
}

function browserLockManager(): PlatformSessionLockManager | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { locks?: PlatformSessionLockManager }).locks;
}
