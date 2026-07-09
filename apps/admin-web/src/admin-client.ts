import { createPlatformApiClient, createPlatformSessionStore } from "@evcp/api-client";

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

export function saveAdminSession(session: { token: string; expiresAt: string }): void {
  sessionStore().saveSession(session);
}

export function clearAdminSession(): void {
  sessionStore().clearSession();
}

export function createAdminPlatformClient() {
  return createPlatformApiClient({
    baseUrl: apiBaseUrl(),
    sessionToken: platformSessionToken(),
    legacyUserEmail: "admin@company.com"
  });
}
