import assert from "node:assert/strict";
import test from "node:test";

const { registerKeycloakOidcRoutes } = await import("../../apps/platform-api/src/keycloak/routes.ts");
const { PlatformSessionService } = await import("../../apps/platform-api/src/auth/platform-session-service.ts");
const { MemoryPlatformSessionRepository } = await import("../../apps/platform-api/src/persistence/platform-session-repository.ts");

function harness() {
  const routes = new Map();
  const service = new PlatformSessionService(new MemoryPlatformSessionRepository(), "test-secret");
  registerKeycloakOidcRoutes({ get: (path, handler) => routes.set(`GET ${path}`, handler), post: (path, handler) => routes.set(`POST ${path}`, handler), put: () => undefined }, {}, service);
  return { service, call: async (path, request = {}) => {
    let status; let body;
    await routes.get(`POST ${path}`)(request, { status: (code) => { status = code; return { json: (value) => { body = value; } }; }, json: (value) => { body = value; } });
    return { status, body };
  } };
}

test("refresh rotates credentials and logout revokes the persisted access session", async () => {
  const api = harness();
  const first = await api.service.issue({ id: "usr_1", email: "user@example.test", providerConfigId: "authprov_1", claims: { email: "user@example.test" } });
  const refreshed = await api.call("/auth/refresh", { body: { refreshToken: first.refreshToken } });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.data.token, first.token);
  const loggedOut = await api.call("/auth/logout", { headers: { authorization: `Bearer ${refreshed.body.data.token}` } });
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.body.data.ok, true);
  const rejected = await api.call("/auth/logout", { headers: { authorization: `Bearer ${refreshed.body.data.token}` } });
  assert.equal(rejected.status, 401);
});

test("refresh endpoint rejects malformed credentials without issuing a token", async () => {
  const api = harness();
  const response = await api.call("/auth/refresh", { body: { refreshToken: "not-a-real-token" } });
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});
