import { createPlatformApiApp, createRuntimePlatformApiServices, resolveCorePersistenceMode } from "./app-factory";
import { readKeycloakConfig } from "./keycloak/config";
import { KeycloakOidcService } from "./keycloak/oidc-service";
import { registerKeycloakOidcRoutes } from "./keycloak/routes";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";
const corePersistenceMode = resolveCorePersistenceMode();

const services = await createRuntimePlatformApiServices();
const app = await createPlatformApiApp(services);
if (process.env.KEYCLOAK_ISSUER_URL) {
  registerKeycloakOidcRoutes(app.getHttpAdapter().getInstance(), new KeycloakOidcService({
    config: readKeycloakConfig(process.env),
    issueKeycloakSession: (claims) => services.authSso.issueKeycloakSession(claims),
    allowedReturnOrigins: { admin: process.env.EVCP_ADMIN_WEB_URL ?? "http://localhost:4100", creator: process.env.EVCP_CREATOR_WEB_URL ?? "http://localhost:4101", store: process.env.EVCP_STORE_WEB_URL ?? "http://localhost:4102" }
  }));
}
await app.listen(port, host);

console.log(`Platform API listening on http://${host}:${port} with core persistence mode: ${corePersistenceMode}`);
