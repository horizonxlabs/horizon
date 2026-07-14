import { createPlatformApiClient, createPlatformSessionStore, createSessionAwareFetch, startKeycloakLogin, startKeycloakLogout } from "@evcp/api-client";

// Shared client + session helpers for the admin app (extracted from main.tsx so the setup wizard
// and login screen can reuse them without duplicating config).

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  return (configured || "/api").replace(/\/$/, "");
}

function sessionStore() {
  return createPlatformSessionStore(window.localStorage);
}

export function platformSessionToken(): string | undefined {
  return sessionStore().getToken();
}

export function hasValidAdminSession(): boolean {
  return Boolean(platformSessionToken());
}

export function saveAdminSession(session: { token: string; expiresAt: string; refreshToken?: string; refreshExpiresAt?: string }): void {
  sessionStore().saveSession(session);
}

export function clearAdminSession(): void {
  sessionStore().clearSession();
}

/** Consume the short-lived Platform session handoff issued after the server-side OIDC callback. */
export function consumeAdminSessionHandoff(location = window.location): boolean {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = params.get("evcp_session");
  const expiresAt = params.get("evcp_session_expires_at");
  const refreshToken = params.get("evcp_refresh_token");
  const refreshExpiresAt = params.get("evcp_refresh_expires_at");
  if (!token || !expiresAt) return false;
  saveAdminSession({ token, expiresAt, ...(refreshToken && refreshExpiresAt ? { refreshToken, refreshExpiresAt } : {}) });
  window.history.replaceState({}, document.title, `${location.pathname}${location.search}`);
  return true;
}

export function createAdminPlatformClient(onSessionEnded?: () => void) {
  return createPlatformApiClient({
    baseUrl: apiBaseUrl(),
    fetcher: createSessionAwareFetch({ baseUrl: apiBaseUrl(), storage: window.localStorage, onSessionEnded })
  });
}

export function startAdminKeycloakLogin(returnTo = window.location.href): string {
  return startKeycloakLogin(apiBaseUrl(), "admin", returnTo);
}

export function startAdminKeycloakLogout(returnTo = window.location.href): string {
  return startKeycloakLogout(apiBaseUrl(), "admin", returnTo);
}
