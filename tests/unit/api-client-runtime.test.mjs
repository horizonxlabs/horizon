import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, createPlatformSessionStore, PlatformApiError, success, failure } = await import("../../packages/api-client/src/index.ts");

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

test("platform API client sends bearer session tokens", async () => {
  let observedAuthorization = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (_url, init) => {
      observedAuthorization = init.headers.get("authorization");
      return new Response(
        JSON.stringify(
          success({
            user: { id: "usr_admin", name: "Admin User", email: "admin@company.com", role: "admin" },
            permissions: ["platform:admin"],
            auth: { mode: "platform_session", legacyMockFallback: false }
          })
        ),
        { status: 200 }
      );
    }
  });

  const result = await client.getCurrentUser();

  assert.equal(observedAuthorization, "Bearer evcp_session.payload.signature");
  assert.equal(result.user.email, "admin@company.com");
  assert.equal(result.auth.mode, "platform_session");
});

test("platform API client sends explicit legacy mock header only when configured", async () => {
  let observedUser = "";
  let observedAuthorization = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api/",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      observedUser = init.headers.get("x-mock-user-email");
      observedAuthorization = init.headers.get("authorization") ?? "";
      assert.equal(String(url), "https://platform.example/api/projects");
      return new Response(JSON.stringify(success([{ id: "proj_001", name: "Leave Management" }])), { status: 200 });
    }
  });

  const projects = await client.listProjects();

  assert.equal(observedUser, "creator@company.com");
  assert.equal(observedAuthorization, "");
  assert.equal(projects[0].name, "Leave Management");
});

test("platform API client throws typed errors for failure envelopes", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    fetcher: async () =>
      new Response(JSON.stringify(failure("FORBIDDEN", "Admin role required", "trace_001")), {
        status: 403
      })
  });

  await assert.rejects(() => client.listStoreApps(), {
    name: "PlatformApiError",
    code: "FORBIDDEN",
    message: "Admin role required",
    traceId: "trace_001",
    status: 403
  });

  assert.equal(PlatformApiError.name, "PlatformApiError");
});

test("platform session store saves loads and clears browser tokens", () => {
  const store = createPlatformSessionStore(createMemoryStorage());

  store.saveSession({
    token: "evcp_session.payload.signature",
    expiresAt: "2026-07-04T02:00:00.000Z"
  });

  assert.equal(store.getToken(), "evcp_session.payload.signature");
  assert.equal(store.getExpiresAt(), "2026-07-04T02:00:00.000Z");

  store.clearSession();

  assert.equal(store.getToken(), undefined);
  assert.equal(store.getExpiresAt(), undefined);
});

test("platform API client posts simulated SSO login payloads through the bridge endpoint", async () => {
  let observedUrl = "";
  let observedBody = {};
  let observedAdminHeader = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      observedAdminHeader = init.headers.get("x-mock-user-email");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "psess_0001",
            providerId: "authprov_keycloak_default_001",
            providerType: "keycloak",
            token: "evcp_session.payload.signature",
            claims: {
              subject: "keycloak-creator-ui-bridge",
              email: "creator@company.com",
              name: "Creator User",
              groups: ["evcp-creators"],
              platformRoles: ["creator"],
              appRoles: { "leave-management": ["HR Admin"] }
            },
            issuedAt: "2026-07-04T01:00:00.000Z",
            expiresAt: "2026-07-04T02:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const session = await client.simulateSsoLogin({
    subject: "keycloak-creator-ui-bridge",
    email: "creator@company.com",
    name: "Creator User",
    groups: ["evcp-creators"],
    appRoles: { "leave-management": ["HR Admin"] }
  });

  assert.equal(observedUrl, "https://platform.example/api/admin/auth/simulate-login");
  assert.equal(observedAdminHeader, "admin@company.com");
  assert.equal(observedBody.providerId, "authprov_keycloak_default_001");
  assert.equal(observedBody.email, "creator@company.com");
  assert.deepEqual(observedBody.groups, ["evcp-creators"]);
  assert.equal(session.token, "evcp_session.payload.signature");
});
