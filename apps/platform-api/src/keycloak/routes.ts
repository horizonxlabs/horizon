import type { KeycloakOidcService } from "./oidc-service";
import "./platform-session-issuer";
import type { PlatformUser } from "../platform-services";
import type { KeycloakUserService } from "./user-service";
export type { KeycloakUserService } from "./user-service";
import { failure, success } from "@evcp/api-client";

type Request = { query?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined>; body?: Record<string, unknown>; params?: Record<string, string> };
type Response = { redirect?: (url: string) => void; status: (code: number) => Response; json: (body: unknown) => void };
type Routes = {
  get: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
  post: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
  put: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void;
};

export function registerKeycloakOidcRoutes(routes: Routes, service: KeycloakOidcService): void {
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
        evcp_session_expires_at: result.session.expiresAt
      }).toString();
      response.redirect?.(handoff.toString());
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "keycloak_login_failed" });
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
      const forbidden = error instanceof Error && error.name === "PermissionError";
      response.status(forbidden ? 403 : 400).json(failure(forbidden ? "FORBIDDEN" : "KEYCLOAK_USER_MANAGEMENT_FAILED", error instanceof Error ? error.message : "Keycloak user management failed"));
    }
  };
  routes.get("/admin/keycloak/users", handle(200, (user) => service.list(user)));
  routes.post("/admin/keycloak/users", handle(201, (user, request) => service.create(user, {
    email: String(request.body?.email ?? ""), name: String(request.body?.name ?? ""), role: String(request.body?.role ?? "") as never, temporaryPassword: String(request.body?.temporaryPassword ?? "")
  })));
  routes.put("/admin/keycloak/users/:id", handle(200, (user, request) => service.update(user, String(request.params?.id ?? ""), { email: String(request.body?.email ?? ""), name: String(request.body?.name ?? "") })));
  routes.post("/admin/keycloak/users/:id/disable", handle(200, (user, request) => service.setEnabled(user, String(request.params?.id ?? ""), false)));
  routes.post("/admin/keycloak/users/:id/enable", handle(200, (user, request) => service.setEnabled(user, String(request.params?.id ?? ""), true)));
  routes.put("/admin/keycloak/users/:id/groups", handle(200, (user, request) => service.setRole(user, String(request.params?.id ?? ""), String(request.body?.role ?? "") as never)));
  routes.post("/admin/keycloak/users/:id/reset-password", handle(200, async (user, request) => { await service.resetPassword(user, String(request.params?.id ?? ""), String(request.body?.temporaryPassword ?? "")); return { id: String(request.params?.id ?? "") }; }));
}
