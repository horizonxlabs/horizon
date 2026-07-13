import assert from "node:assert/strict";
import test from "node:test";

const { KeycloakAdminClient } = await import("../../apps/platform-api/src/keycloak/admin-client.ts");
const { KeycloakUserService } = await import("../../apps/platform-api/src/keycloak/user-service.ts");
const { registerKeycloakUserManagementRoutes } = await import("../../apps/platform-api/src/keycloak/routes.ts");
const { AuditService, createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createKeycloakAdminHarness({ platformSessions } = {}) {
  const services = createPlatformApiServices();
  const adminSession = services.authSso.issueKeycloakSession({
    subject: "keycloak-admin-001", email: "admin@company.com", name: "Admin",
    groups: ["evcp-admins"], platformRoles: ["admin"], appRoles: {}
  });
  const creatorSession = services.authSso.issueKeycloakSession({
    subject: "keycloak-creator-001", email: "creator@company.com", name: "Creator",
    groups: ["evcp-creators"], platformRoles: ["creator"], appRoles: {}
  });
  const audit = new AuditService();
  const users = new Map();
  const groups = new Map([
    ["evcp-admins", { id: "grp_admin", name: "evcp-admins" }],
    ["evcp-creators", { id: "grp_creator", name: "evcp-creators" }],
    ["evcp-users", { id: "grp_user", name: "evcp-users" }],
    ["external-contractors", { id: "grp_external", name: "external-contractors" }]
  ]);
  let nextId = 1;
  const config = {
    issuerUrl: "https://keycloak.example.test/realms/evcp", internalIssuerUrl: "http://keycloak.internal.test/realms/evcp", realm: "evcp",
    platformClientId: "platform", platformClientSecret: "not-for-browser",
    adminClientId: "admin-service", adminClientSecret: "server-only", callbackUrl: "https://api.example.test/callback"
  };
  const client = new KeycloakAdminClient({ config, fetch: async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const path = requestUrl.pathname.replace("/auth/admin/realms/evcp", "").replace("/admin/realms/evcp", "");
    const method = options.method ?? "GET";
    if (path.endsWith("/protocol/openid-connect/token")) return json({ access_token: "service-token" });
    if (path === "/groups" && method === "GET") return json([...groups.values()]);
    if (path === "/users/count" && method === "GET") return json(users.size);
    if (path === "/users" && method === "GET") {
      const first = Number(requestUrl.searchParams.get("first") ?? 0);
      const max = Number(requestUrl.searchParams.get("max") ?? 50);
      return json([...users.values()].slice(first, first + max).map(({ groups: _groups, ...user }) => user));
    }
    if (path === "/users" && method === "POST") {
      const body = JSON.parse(String(options.body)); const id = `user_${nextId++}`;
      users.set(id, { id, email: body.email, firstName: body.firstName, enabled: body.enabled, createdTimestamp: 0, groups: [] });
      return new Response(null, { status: 201, headers: { location: `https://keycloak.example.test/admin/realms/evcp/users/${id}` } });
    }
    const match = path.match(/^\/users\/([^/]+)(?:\/(groups|reset-password))?(?:\/([^/]+))?$/);
    if (!match) return new Response("not found", { status: 404 });
    const [, id, action, groupId] = match; const user = users.get(id);
    if (!user) return new Response("not found", { status: 404 });
    if (!action && method === "GET") { const { groups: _groups, ...record } = user; return json(record); }
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
  registerKeycloakUserManagementRoutes(routes, userService, (headers) => services.auth.resolveCurrentUser(headers ?? {}), platformSessions);
  const request = async (session, method, path, body) => {
    const requestUrl = new URL(path, "https://platform.example.test");
    const pathname = requestUrl.pathname;
    const key = `${method} ${pathname.replace(/\/[^/]+\/(disable|enable|groups|reset-password)$/, "/:id/$1").replace(/\/[^/]+\/sessions(?:\/revoke)?$/, (value) => value.includes("revoke") ? "/:id/sessions/revoke" : "/:id/sessions").replace(/\/users\/[^/]+$/, "/users/:id")}`;
    const handler = handlers.get(key);
    let status = 200; let responseBody;
    await handler({ headers: session ? { authorization: `Bearer ${session.token}` } : {}, query: Object.fromEntries(requestUrl.searchParams), body, params: pathname.match(/^\/admin\/keycloak\/users\/([^/]+)/) ? { id: pathname.split("/")[4] } : {} }, { status: (code) => { status = code; return { json: (value) => { responseBody = value; } }; }, json: (value) => { responseBody = value; } });
    return { status, body: responseBody };
  };
  return {
    asAdmin: (method, path, body) => request(adminSession, method, path, body),
    asCreator: (method, path, body) => request(creatorSession, method, path, body),
    asAnonymous: (method, path, body) => request(undefined, method, path, body),
    addGroup: (id, name) => users.get(id).groups.push(name), audit
  };
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
  assert.deepEqual(exec.audit.list().map((event) => event.action), ["auth.keycloak_user.role_changed", "auth.keycloak_user.created", "auth.keycloak_user.enabled_changed", "auth.keycloak_user.password_reset"]);
  assert.equal(exec.audit.list().some((event) => /Temp1234!|Next1234!/.test(JSON.stringify(event))), false);
});

test("creator cannot call Keycloak user-management API", async () => {
  const response = await createKeycloakAdminHarness().asCreator("GET", "/admin/keycloak/users");
  assert.equal(response.status, 403);
});

test("admin can revoke a Keycloak user's mapped Platform sessions", async () => {
  const calls = [];
  const exec = createKeycloakAdminHarness({ platformSessions: { revokeUserSessions: async (...input) => calls.push(input) } });
  const response = await exec.asAdmin("POST", "/admin/keycloak/users/keycloak-subject-42/sessions/revoke");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, "keycloak-subject-42");
  assert.match(calls[0][0], /^usr_sso_/);
  assert.equal(calls[0][1], "admin_revoked");
});

test("admin can view session metadata without exposing refresh credentials", async () => {
  const exec = createKeycloakAdminHarness({ platformSessions: { listUserSessions: async () => [{ id: "sess_1", sessionFamilyId: "family_1", expiresAt: new Date("2026-07-14T00:00:00.000Z"), refreshExpiresAt: new Date("2026-07-20T00:00:00.000Z"), refreshTokenHash: "must-not-leak", sessionTokenHash: "must-not-leak", claims: { email: "user@example.test" } }] } });
  const response = await exec.asAdmin("GET", "/admin/keycloak/users/keycloak-subject-42/sessions");
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].id, "sess_1");
  assert.equal("refreshTokenHash" in response.body.data[0], false);
  assert.equal("sessionTokenHash" in response.body.data[0], false);
});

test("admin lists, updates, enables, and replaces only EVCP role groups", async () => {
  const exec = createKeycloakAdminHarness();
  const created = await exec.asAdmin("POST", "/admin/keycloak/users", { email: "before@company.com", name: "Before", role: "creator", temporaryPassword: "Temp1234!" });
  const id = created.body.data.id;
  exec.addGroup(id, "external-contractors");
  const listed = await exec.asAdmin("GET", "/admin/keycloak/users");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].email, "before@company.com");
  const updated = await exec.asAdmin("PUT", `/admin/keycloak/users/${id}`, { email: "after@company.com", name: "After" });
  assert.equal(updated.body.data.name, "After");
  assert.equal((await exec.asAdmin("POST", `/admin/keycloak/users/${id}/enable`)).body.data.enabled, true);
  const roleChanged = await exec.asAdmin("PUT", `/admin/keycloak/users/${id}/groups`, { role: "end_user" });
  assert.deepEqual(roleChanged.body.data.groups.sort(), ["evcp-users", "external-contractors"]);
  assert.deepEqual(exec.audit.list().map((event) => event.action), ["auth.keycloak_user.role_changed", "auth.keycloak_user.created", "auth.keycloak_user.updated", "auth.keycloak_user.enabled_changed", "auth.keycloak_user.role_changed"]);
});

test("admin user listing paginates at Keycloak and returns total metadata", async () => {
  const exec = createKeycloakAdminHarness();
  for (const email of ["first@company.com", "second@company.com", "third@company.com"]) {
    await exec.asAdmin("POST", "/admin/keycloak/users", { email, name: email, role: "creator", temporaryPassword: "Temp1234!" });
  }
  const response = await exec.asAdmin("GET", "/admin/keycloak/users?first=1&max=1");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].email, "second@company.com");
  assert.deepEqual(response.body.meta, { first: 1, max: 1, total: 3 });
});

test("admin supports every valid platform role and rejects invalid roles", async () => {
  const exec = createKeycloakAdminHarness();
  for (const [role, group] of [["admin", "evcp-admins"], ["creator", "evcp-creators"], ["end_user", "evcp-users"]]) {
    const response = await exec.asAdmin("POST", "/admin/keycloak/users", { email: `${role}@company.com`, name: role, role, temporaryPassword: "Temp1234!" });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body.data.groups, [group]);
  }
  const invalid = await exec.asAdmin("POST", "/admin/keycloak/users", { email: "bad@company.com", name: "Bad", role: "owner", temporaryPassword: "Temp1234!" });
  assert.equal(invalid.status, 400);
});

test("unauthenticated callers receive 401 from Keycloak user-management routes", async () => {
  assert.equal((await createKeycloakAdminHarness().asAnonymous("GET", "/admin/keycloak/users")).status, 401);
});
