import {
  createPlatformSessionStore,
  type CurrentUserResponse,
  type StorefrontAppCardDto,
  type StorefrontHomeResponse
} from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import type { PlatformRole } from "@evcp/types";
import {
  createStorePlatformClient,
  startStoreKeycloakLogin,
  startStoreKeycloakLogout
} from "./platform-client";

export type StoreAppItem = AppStoreItem & {
  subdomain?: string;
  subdomainUrl?: string;
};

export type StoreBootstrapState = {
  status: "loading" | "ready" | "error";
  userName?: string;
  email?: string;
  role?: PlatformRole;
  myApps: StoreAppItem[];
  availableApps: StoreAppItem[];
  source: "Platform API";
  error?: string;
};

export const initialStoreBootstrap: StoreBootstrapState = {
  status: "loading",
  myApps: [],
  availableApps: [],
  source: "Platform API"
};

function appCardToStoreItem(app: StorefrontAppCardDto): StoreAppItem {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    owner: app.ownerName,
    route: app.route,
    ...(app.subdomain !== undefined ? { subdomain: app.subdomain } : {}),
    ...(app.subdomainUrl !== undefined ? { subdomainUrl: app.subdomainUrl } : {}),
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
    status: "ready",
    userName: storeHome.profile.userName || currentUser.user.name,
    email: storeHome.profile.email || currentUser.user.email,
    role: currentUser.user.role,
    myApps: storeHome.myApps.map(appCardToStoreItem),
    availableApps: storeHome.availableApps.map(appCardToStoreItem),
    source: "Platform API"
  };
}

export function signInStoreSessionBridge(): void {
  window.location.assign(startStoreKeycloakLogin(window.location.href));
}

export function beginStoreKeycloakLogout(): void {
  window.location.assign(startStoreKeycloakLogout(window.location.href));
}

function consumeStoreSessionHandoff(): void {
  const handoff = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = handoff.get("evcp_session");
  const expiresAt = handoff.get("evcp_session_expires_at");
  const refreshToken = handoff.get("evcp_refresh_token");
  const refreshExpiresAt = handoff.get("evcp_refresh_expires_at");
  if (!token || !expiresAt) return;
  createPlatformSessionStore(window.localStorage).saveSession({
    token,
    expiresAt,
    ...(refreshToken && refreshExpiresAt ? { refreshToken, refreshExpiresAt } : {})
  });
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
}

export function clearStoreSessionBridge(): StoreBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return {
    ...initialStoreBootstrap,
    status: "error",
    error: "Your session has ended. Sign in again to access the app store."
  };
}
