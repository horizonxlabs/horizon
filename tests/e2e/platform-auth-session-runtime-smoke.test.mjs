import assert from "node:assert/strict";
import { test } from "node:test";

const { createRuntimePlatformApiServices, executePlatformApiRequestAsync } = await import("../../apps/platform-api/src/app-factory.ts");

test("runtime memory persistence accepts signed Platform Auth bearer sessions across core routes", async () => {
  const services = await createRuntimePlatformApiServices({ EVCP_CORE_PERSISTENCE: "memory" });

  const login = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/admin/auth/simulate-login",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: {
      providerId: "authprov_keycloak_default_001",
      subject: "keycloak-creator-runtime-001",
      email: "creator.runtime.session@company.com",
      name: "Creator Runtime Session",
      groups: ["evcp-creators"],
      appRoles: { "runtime-session-project": ["Employee"] }
    }
  });

  assert.equal(login.status, 201);
  assert.equal(login.body.data.token.startsWith("evcp_session."), true);

  const bearerHeaders = { authorization: `Bearer ${login.body.data.token}` };
  const me = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/auth/me",
    headers: bearerHeaders
  });
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: bearerHeaders,
    body: {
      name: "Runtime Session Project",
      slug: "runtime-session-project",
      businessProblem: "Validate Platform Auth sessions against repository-backed core routes",
      intendedUsers: ["Creator", "Reviewer"],
      dataSensitivity: "internal"
    }
  });
  const listed = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/projects",
    headers: bearerHeaders
  });
  const audit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { projectId: "prj_runtime_session_project", action: "project.created" }
  });

  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, "creator.runtime.session@company.com");
  assert.equal(me.body.data.user.role, "creator");
  assert.equal(me.body.data.auth.mode, "platform_session");
  assert.equal(me.body.data.auth.sessionId, login.body.data.id);
  assert.equal(me.body.data.auth.legacyMockFallback, false);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.id, "prj_runtime_session_project");
  assert.deepEqual(listed.body.data.map((project) => project.slug), ["runtime-session-project"]);
  assert.equal(audit.status, 200);
  assert.equal(audit.body.data.length, 1);
  assert.equal(audit.body.data[0].metadata.slug, "runtime-session-project");
});

