import type { KeycloakOidcService } from "./oidc-service";
import "./platform-session-issuer";

type Request = { query?: Record<string, unknown> };
type Response = { redirect?: (url: string) => void; status: (code: number) => Response; json: (body: unknown) => void };
type Routes = { get: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void };

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
