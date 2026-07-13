import assert from "node:assert/strict";
import test from "node:test";

const { KeycloakAdminClient } = await import("../../apps/platform-api/src/keycloak/admin-client.ts");
const { KeycloakUserService } = await import("../../apps/platform-api/src/keycloak/user-service.ts");
const { registerKeycloakUserManagementRoutes } = await import("../../apps/platform-api/src/keycloak/routes.ts");
const { AuditService, createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createKeycloakAdminHarness() {
  const services = createPlatformApiServices();
  const audit = new AuditService();
  const users = new Map();
  const groups = new Map([
    ["evcp-admins", { id: "grp_admin", name: "evcp-admins" }],
    ["evcp-creators", { id: "grp_creator", name: "evcp-creators" }],
    ["evcp-users", { id: "grp_user", name: "evcp-users" }]
  ]);
  let nextId = 1;
  const config = {
    issuerUrl: "https://keycloak.example.test/realms/evcp", realm: "evcp",
    platformClientId: "platform", platformClientSecret: "not-for-browser",
    adminClientId: "admin-service", adminClientSecret: "server-only", callbackUrl: "https://api.example.test/callback"
  };
  const client = new KeycloakAdminClient({ config, fetch: async (url, options = {}) => {
    const path = new URL(String(url)).pathname.replace("/admin/realms/evcp", "");
    const method = options.method ?? "GET";
    if (path.endsWith("/protocol/openid-connect/token")) return json({ access_token: "service-token" });
    if (path === "/groups" && method === "GET") return json([...groups.values()]);
    if (path === "/users" && method === "GET") return json([...users.values()].map(({ groups: ignored, ...user }) => user));
    if (path === "/users" && method === "POST") {
      const body = JSON.parse(String(options.body)); const id = `user_${nextId++}`;
      users.set(id, { id, email: body.email, firstName: body.firstName, enabled: body.enabled, createdTimestamp: 0, groups: [] });
      return new Response(null, { status: 201, headers: { location: `https://keycloak.example.test/admin/realms/evcp/users/${id}` } });
    }
    const match = path.match(/^\/users\/([^/]+)(?:\/(groups|reset-password))?(?:\/([^/]+))?$/);
    if (!match) return new Response("not found", { status: 404 });
    const [, id, action, groupId] = match; const user = users.get(id);
    if (!user) return new Response("not found", { status: 404 });
    if (!action && method === "GET") { const { groups: ignored, ...record } = user; return json(record); }
    if (!action && method === "PUT") { Object.assign(user, JSON.parse(String(options.body))); return new Response(null, { status: 204 }); }
    if (action === "groups" && method === "GET") return json(user.groups.map((name) => groups.get(name)));
    if (action === "groups" && method === "PUT") { user.groups = [...user.groups, [...groups.values()].find((group) => group.id === groupId).name]; return new Response(null, { status: 204 }); }
    if (action === "groups" && method === "DELETE") { user.groups = user.groups.filter((name) => groups.get(name).id !== groupId); return new Response(null, { status: 204 }); }
    if (action === "reset-password" && method === "PUT") return new Response(null, { status: 204 });
    return new Response("bad request", { status: 400 });
  }});
  const userService = new KeycloakUserService({ client, audit, requireAdmin: (actor) => services.auth.requireRole(actor, ["admin"]) });
  const handlers = new Map();
  const routes = { get: (path, handler) => handlers.set(`GET ${path}`, handler), post: (path, handler) => handlers.set(`POST ${path}`, handler), put: (path, handler) => handlers.set(`PUT ${path}`, handler) };
  registerKeycloakUserManagementRoutes(routes, userService, (headers) => services.auth.resolveCurrentUser(headers ?? {}));
  const request = async (email, method, path, body) => {
    const key = `${method} ${path.replace(/\/[^/]+\/(disable|enable|groups|reset-password)$/, "/:id/$1").replace(/\/users\/[^/]+$/, "/users/:id")}`;
    const handler = handlers.get(key);
    let status = 200; let responseBody;
    await handler({ headers: { "x-mock-user-email": email }, body, params: path.match(/^\/admin\/keycloak\/users\/([^/]+)/) ? { id: path.split("/")[4] } : {} }, { status: (code) => { status = code; return { json: (value) => { responseBody = value; } }; }, json: (value) => { responseBody = value; } });
    return { status, body: responseBody };
  };
  return { asAdmin: (method, path, body) => request("admin@company.com", method, path, body), asCreator: (method, path, body) => request("creator@company.com", method, path, body), audit };
}

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("admin can create, role-map, disable and reset a Keycloak user without receiving a password", async () => {
  const exec = createKeycloakAdminHarness();
  const created = await exec.asAdmin("POST", "/admin/keycloak/users", { email: "new@company.com", name: "New", role: "creator", temporaryPassword: "Temp1234!" });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data.groups, ["evcp-creators"]);
  assert.equal("temporaryPassword" in created.body.data, false);
  assert.equal((await exec.asAdmin("POST", `/admin/keycloak/users/${created.body.data.id}/disable`)).status, 200);
  assert.equal((await exec.asAdmin("POST", `/admin/keycloak/users/${created.body.data.id}/reset-password`, { temporaryPassword: "Next1234!" })).status, 200);
  assert.equal(exec.audit.list().some((event) => /Temp1234!|Next1234!/.test(JSON.stringify(event))), false);
});

test("creator cannot call Keycloak user-management API", async () => {
  const response = await createKeycloakAdminHarness().asCreator("GET", "/admin/keycloak/users");
  assert.equal(response.status, 403);
});
