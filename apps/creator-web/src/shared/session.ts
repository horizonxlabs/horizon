import { createPlatformSessionStore } from "@evcp/api-client";
import type { NativeLoginResult } from "@/shared/types";

export function platformSessionToken(): string | undefined {
  return createPlatformSessionStore(window.localStorage).getToken();
}

export function persistLoginSession(
  res: NativeLoginResult,
  storage: { setItem: (k: string, v: string) => void } = window.localStorage
): void {
  storage.setItem("evcp_session", res.token);
  storage.setItem("evcp_session_expires_at", res.expiresAt);
}

export function needsPasswordChange(res: { mustChangePassword: boolean }): boolean {
  return res.mustChangePassword === true;
}

export function clearLoginSession(
  storage: { removeItem: (k: string) => void } = window.localStorage
): void {
  storage.removeItem("evcp_session");
  storage.removeItem("evcp_session_expires_at");
}

export function hasValidSession(): boolean {
  const token = platformSessionToken();
  if (!token) return false;
  const expiresAt = window.localStorage.getItem("evcp_session_expires_at");
  if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= Date.now())
    return false;
  return true;
}

// The 15-minute access token expiring doesn't mean the session is over — a still-valid
// refresh token (7-day lifetime) lets createSessionAwareFetch renew it transparently on
// the next API call. Gating app entry on hasValidSession() alone forces a full re-login
// on any reload that lands more than 15 idle minutes after the last token refresh.
export function canEnterWorkspace(): boolean {
  if (hasValidSession()) return true;
  const store = createPlatformSessionStore(window.localStorage);
  if (!store.getToken()) return false;
  const refreshExpiresAt = store.getRefreshExpiresAt();
  return Boolean(
    store.getRefreshToken() &&
      refreshExpiresAt &&
      Number.isFinite(Date.parse(refreshExpiresAt)) &&
      Date.parse(refreshExpiresAt) > Date.now()
  );
}

// --- Live "vibe coding" via /chat SSE generation loop ---
export function vibeAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = platformSessionToken();
  if (token) headers["authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return headers;
}
