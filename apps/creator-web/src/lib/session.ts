import { createPlatformSessionStore } from "@evcp/api-client";
import type { NativeLoginResult } from "../types";

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

// --- Live "vibe coding" via /chat SSE generation loop ---
export function vibeAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = platformSessionToken();
  if (token) headers["authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return headers;
}
