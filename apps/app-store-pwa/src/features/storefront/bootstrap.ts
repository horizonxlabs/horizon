import {
  createPlatformSessionStore,
  type CurrentUserResponse,
  type StorefrontAppCardDto,
  type StorefrontHomeResponse
} from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { createStorePlatformClient, startStoreKeycloakLogin } from "./platform-client";

export type StoreBootstrapState = {
  userName: string;
  email: string;
  myApps: AppStoreItem[];
  availableApps: AppStoreItem[];
  source: "Platform API" | "local fallback";
};

export const fallbackStoreApps: AppStoreItem[] = [
  {
    id: "app_leave_management",
    slug: "leave-management",
    name: "Leave Management",
    description:
      "Submit, approve and track leave requests inside the private enterprise app store.",
    owner: "Creator User",
    route: "/apps/leave-management",
    myRole: "Employee",
    accessStatus: "active",
    health: "healthy"
  },
  {
    id: "app_procurement",
    slug: "procurement-request",
    name: "Procurement Request",
    description: "Request purchasing approval with governed access.",
    owner: "Finance Ops",
    route: "/apps/procurement-request",
    accessStatus: "available",
    health: "healthy"
  }
];

export const initialStoreBootstrap: StoreBootstrapState = {
  userName: "End User",
  email: "user@company.com",
  myApps: fallbackStoreApps.filter((app) => app.accessStatus === "active"),
  availableApps: fallbackStoreApps.filter((app) => app.accessStatus !== "active"),
  source: "local fallback"
};

function appCardToStoreItem(app: StorefrontAppCardDto): AppStoreItem {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    owner: app.ownerName,
    route: app.route,
    myRole: app.myRole,
    accessStatus: app.accessStatus,
    installStatus: app.installStatus,
    primaryAction: app.primaryAction as AppStoreItem["primaryAction"],
    health: app.health as AppStoreItem["health"]
  };
}
export async function loadStoreBootstrap(): Promise<StoreBootstrapState> {
  consumeStoreSessionHandoff();
  if (!createPlatformSessionStore(window.localStorage).getToken()) {
    signInStoreSessionBridge();
    throw new Error("Your session has ended. Sign in again to access the app store.");
  }
  const client = createStorePlatformClient();
  const [currentUser, storeHome]: [CurrentUserResponse, StorefrontHomeResponse] = await Promise.all(
    [client.getCurrentUser(), client.listStoreApps()]
  );
  return {
    userName: storeHome.profile.userName || currentUser.user.name,
    email: storeHome.profile.email || currentUser.user.email,
    myApps: storeHome.myApps.map(appCardToStoreItem),
    availableApps: storeHome.availableApps.map(appCardToStoreItem),
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

export function signInStoreSessionBridge(): void {
  window.location.assign(startStoreKeycloakLogin(window.location.href));
}

function consumeStoreSessionHandoff(): void {
  const handoff = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = handoff.get("evcp_session");
  const expiresAt = handoff.get("evcp_session_expires_at");
  const refreshToken = handoff.get("evcp_refresh_token");
  const refreshExpiresAt = handoff.get("evcp_refresh_expires_at");
  if (!token || !expiresAt) return;
  createPlatformSessionStore(window.localStorage).saveSession({
    token, expiresAt, ...(refreshToken && refreshExpiresAt ? { refreshToken, refreshExpiresAt } : {})
  });
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

export function clearStoreSessionBridge(): StoreBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return initialStoreBootstrap;
}
