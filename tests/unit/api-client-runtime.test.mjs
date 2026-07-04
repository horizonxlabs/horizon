import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, PlatformApiError, success, failure } = await import("../../packages/api-client/src/index.ts");

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
