export type PlatformSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EVCP_SESSION_STORAGE_KEY = "evcp_session";
export const EVCP_SESSION_EXPIRES_AT_STORAGE_KEY = "evcp_session_expires_at";
export const EVCP_REFRESH_TOKEN_STORAGE_KEY = "evcp_refresh_token";
export const EVCP_REFRESH_EXPIRES_AT_STORAGE_KEY = "evcp_refresh_expires_at";

export type PlatformSessionTokenPair = {
  token: string;
  expiresAt: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
};

export class PlatformSessionStore {
  constructor(private readonly storage: PlatformSessionStorage) {}

  getToken(): string | undefined { return this.storage.getItem(EVCP_SESSION_STORAGE_KEY) ?? undefined; }
  getExpiresAt(): string | undefined { return this.storage.getItem(EVCP_SESSION_EXPIRES_AT_STORAGE_KEY) ?? undefined; }
  getRefreshToken(): string | undefined { return this.storage.getItem(EVCP_REFRESH_TOKEN_STORAGE_KEY) ?? undefined; }
  getRefreshExpiresAt(): string | undefined { return this.storage.getItem(EVCP_REFRESH_EXPIRES_AT_STORAGE_KEY) ?? undefined; }

  saveSession(session: PlatformSessionTokenPair): void {
    this.storage.setItem(EVCP_SESSION_STORAGE_KEY, session.token);
    this.storage.setItem(EVCP_SESSION_EXPIRES_AT_STORAGE_KEY, session.expiresAt);
    if (session.refreshToken && session.refreshExpiresAt) {
      this.storage.setItem(EVCP_REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
      this.storage.setItem(EVCP_REFRESH_EXPIRES_AT_STORAGE_KEY, session.refreshExpiresAt);
    }
  }

  clearSession(): void {
    for (const key of [EVCP_SESSION_STORAGE_KEY, EVCP_SESSION_EXPIRES_AT_STORAGE_KEY, EVCP_REFRESH_TOKEN_STORAGE_KEY, EVCP_REFRESH_EXPIRES_AT_STORAGE_KEY]) this.storage.removeItem(key);
  }
}
