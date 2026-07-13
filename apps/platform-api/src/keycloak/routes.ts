import type { KeycloakOidcService } from "./oidc-service";
import "./platform-session-issuer";
import type { PlatformUser } from "../platform-services";
import type { KeycloakUserService } from "./user-service";
export type { KeycloakUserService } from "./user-service";
import { failure, success } from "@evcp/api-client";
import { PlatformSessionError, type PlatformSessionService } from "../auth/platform-session-service";

type Request = { query?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown>; params?: Record<string, string> };
type Response = { redirect?: (url: string) => void; status: (code: number) => Response; json: (body: unknown) => void };
type Routes = {
  get: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
  post: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
  put: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
};

export function registerKeycloakOidcRoutes(
  routes: Routes,
  service: KeycloakOidcService,
  sessions?: PlatformSessionService
): void {
  routes.get("/auth/keycloak/start", (request, response) => {
    const app = request.query?.app;
    const returnTo = request.query?.returnTo;
    if ((app !== "admin" && app !== "creator" && app !== "store") || typeof returnTo !== "string") {
      response.status(400).json({ error: "invalid_oidc_start" });
      return;
    }
    try { response.redirect?.(service.start(app, returnTo).authorizationUrl); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "invalid_oidc_start" }); }
  });
  routes.get("/auth/keycloak/callback", async (request, response) => {
    try {
      const code = request.query?.code;
      const state = request.query?.state;
      if (typeof code !== "string" || typeof state !== "string") throw new Error("invalid_oidc_callback");
      const result = await service.complete({ code, state });
      const handoff = new URL(result.returnTo);
      handoff.hash = new URLSearchParams({
        evcp_session: result.session.token,
        evcp_session_expires_at: result.session.expiresAt,
        ...(result.session.refreshToken ? { evcp_refresh_token: result.session.refreshToken } : {}),
        ...(result.session.refreshExpiresAt ? { evcp_refresh_expires_at: result.session.refreshExpiresAt } : {})
      }).toString();
      response.redirect?.(handoff.toString());
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "keycloak_login_failed" });
    }
  });
  routes.post("/auth/refresh", async (request, response) => {
    if (!sessions || typeof request.body?.refreshToken !== "string") {
      response.status(401).json(failure("UNAUTHORIZED", "Invalid refresh token"));
      return;
    }
    try {
      response.status(200).json(success(await sessions.refresh(request.body.refreshToken)));
    } catch (error) {
      const message = error instanceof PlatformSessionError ? "Session refresh rejected" : "Session refresh failed";
      response.status(401).json(failure("UNAUTHORIZED", message));
    }
  });
  routes.post("/auth/logout", async (request, response) => {
    const authorization = request.headers?.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = value?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!sessions || !token) {
      response.status(401).json(failure("UNAUTHORIZED", "Missing session token"));
      return;
    }
    try {
      const session = await sessions.verify(token);
      await sessions.logout(session.id);
      response.status(200).json(success({ ok: true }));
    } catch {
      response.status(401).json(failure("UNAUTHORIZED", "Invalid session token"));
    }
  });
}

export function registerKeycloakUserManagementRoutes(
  routes: Routes,
  service: KeycloakUserService,
  resolveUser: (headers: Request["headers"]) => PlatformUser | Promise<PlatformUser>
): void {
  const handle = (status: number, action: (user: PlatformUser, request: Request) => Promise<unknown>) => async (request: Request, response: Response) => {
    try { response.status(status).json(success(await action(await resolveUser(request.headers), request))); }
    catch (error) {
      const unauthenticated = error instanceof Error && error.name === "MockAuthError";
      const forbidden = error instanceof Error && error.name === "PermissionError";
      const responseStatus = unauthenticated ? 401 : forbidden ? 403 : 400;
      response.status(responseStatus).json(failure(unauthenticated ? "UNAUTHORIZED" : forbidden ? "FORBIDDEN" : "KEYCLOAK_USER_MANAGEMENT_FAILED", error instanceof Error ? error.message : "Keycloak user management failed"));
    }
  };
  routes.get("/admin/keycloak/users", async (request, response) => {
    try {
      const user = await resolveUser(request.headers);
      const page = pagination(request.query);
      const result = await service.list(user, page);
      response.status(200).json(success(result.users, { first: result.first, max: result.max, total: result.total }));
    } catch (error) {
      const unauthenticated = error instanceof Error && error.name === "MockAuthError";
      const forbidden = error instanceof Error && error.name === "PermissionError";
      const responseStatus = unauthenticated ? 401 : forbidden ? 403 : 400;
      response.status(responseStatus).json(failure(unauthenticated ? "UNAUTHORIZED" : forbidden ? "FORBIDDEN" : "KEYCLOAK_USER_MANAGEMENT_FAILED", error instanceof Error ? error.message : "Keycloak user management failed"));
    }
  });
  routes.post("/admin/keycloak/users", handle(201, (user, request) => service.create(user, {
    email: String(request.body?.email ?? ""), name: String(request.body?.name ?? ""), role: String(request.body?.role ?? "") as never, temporaryPassword: String(request.body?.temporaryPassword ?? "")
  })));
  routes.put("/admin/keycloak/users/:id", handle(200, (user, request) => service.update(user, String(request.params?.id ?? ""), { email: String(request.body?.email ?? ""), name: String(request.body?.name ?? "") })));
  routes.post("/admin/keycloak/users/:id/disable", handle(200, (user, request) => service.setEnabled(user, String(request.params?.id ?? ""), false)));
  routes.post("/admin/keycloak/users/:id/enable", handle(200, (user, request) => service.setEnabled(user, String(request.params?.id ?? ""), true)));
  routes.put("/admin/keycloak/users/:id/groups", handle(200, (user, request) => service.setRole(user, String(request.params?.id ?? ""), String(request.body?.role ?? "") as never)));
  routes.post("/admin/keycloak/users/:id/reset-password", handle(200, async (user, request) => { await service.resetPassword(user, String(request.params?.id ?? ""), String(request.body?.temporaryPassword ?? "")); return { id: String(request.params?.id ?? "") }; }));
}

function pagination(query: Request["query"]): { first: number; max: number } {
  const first = query?.first === undefined ? 0 : Number(query.first);
  const max = query?.max === undefined ? 50 : Number(query.max);
  if (!Number.isInteger(first) || first < 0 || !Number.isInteger(max) || max < 1 || max > 100) throw new Error("invalid_pagination");
  return { first, max };
}
