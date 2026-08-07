import test from "node:test";
import assert from "node:assert/strict";

// These smoke cases explicitly exercise the legacy development-only auth adapter.
// Keep the opt-in local to this test process so a production-like `.env` cannot
// silently change their meaning.
process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { createPlatformApiApp, executePlatformApiRequest } = await import(
  "../../apps/platform-api/src/app-factory.ts"
);
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);
const {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/core-repositories.ts");
const {
  MemoryAiGovernancePersistenceClient,
  createAiGovernanceRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/ai-governance-repositories.ts");
const { PlatformSessionService } = await import(
  "../../apps/platform-api/src/auth/platform-session-service.ts"
);
const { MemoryPlatformSessionRepository } = await import(
  "../../apps/platform-api/src/persistence/platform-session-repository.ts"
);
const {
  MemoryPrdPersistenceClient,
  createPrdRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/prd-repositories.ts");
const {
  MemoryWorkspacePersistenceClient,
  createWorkspaceRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/workspace-repositories.ts");
const {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/publish-store-repositories.ts");

test("platform API health and auth/me return shared success envelopes", async () => {
  const services = createPlatformApiServices();
  const health = executePlatformApiRequest(services, { method: "GET", path: "/health" });
  const healthJson = health.body;

  assert.equal(health.status, 200);
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.data.service, "platform-api");

  const me = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: { "x-mock-user-email": "admin@company.com" }
  });
  const meJson = me.body;

  assert.equal(me.status, 200);
  assert.equal(meJson.ok, true);
  assert.equal(meJson.data.user.email, "admin@company.com");
  assert.equal(meJson.data.auth.mode, "mock_header");
  assert.equal(meJson.data.auth.legacyMockFallback, true);
  assert.ok(meJson.data.permissions.includes("platform:admin"));
});

test("platform API rejects missing mock auth and audits project creation", async () => {
  const services = createPlatformApiServices();
  const denied = executePlatformApiRequest(services, { method: "GET", path: "/auth/me" });
  const deniedJson = denied.body;

  assert.equal(denied.status, 401);
  assert.equal(deniedJson.ok, false);
  assert.equal(deniedJson.error.code, "UNAUTHORIZED");

  const created = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { name: "Leave Management" }
  });
  const createdJson = created.body;

  assert.equal(created.status, 201);
  assert.equal(createdJson.ok, true);
  assert.match(createdJson.data.id, /^prj_[0-9a-f]{32}$/);

  const audit = executePlatformApiRequest(services, {
    method: "GET",
    path: "/audit-logs",
    headers: { "x-mock-user-email": "admin@company.com" }
  });
  const auditJson = audit.body;

  assert.equal(audit.status, 200);
  assert.ok(auditJson.data.some((event) => event.action === "project.created"));
});

test("platform API accepts signed platform session bearer tokens on normal routes", async () => {
  const services = createPlatformApiServices();
  const login = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/auth/simulate-login",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: {
      providerId: "authprov_keycloak_default_001",
      subject: "keycloak-creator-001",
      email: "creator.session@company.com",
      name: "Creator Session",
      groups: ["evcp-creators"],
      appRoles: { "leave-management": ["Employee"] }
    }
  });

  assert.equal(login.status, 201);
  assert.equal(login.body.data.token.startsWith("evcp_session."), true);

  const bearerHeaders = { authorization: `Bearer ${login.body.data.token}` };
  const me = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: bearerHeaders
  });

  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, "creator.session@company.com");
  assert.equal(me.body.data.user.role, "creator");
  assert.equal(me.body.data.auth.mode, "platform_session");
  assert.equal(me.body.data.auth.sessionId, login.body.data.id);
  assert.equal(me.body.data.auth.legacyMockFallback, false);

  const projects = executePlatformApiRequest(services, {
    method: "GET",
    path: "/projects",
    headers: bearerHeaders
  });

  assert.equal(projects.status, 200);
  assert.equal(projects.body.ok, true);

  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: "/auth/me",
    headers: { authorization: "Bearer evcp_session.invalid.invalid" }
  });

  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, "UNAUTHORIZED");
});

test("platform HTTP runtime parses JSON bodies for admin configuration routes", async () => {
  const app = await createPlatformApiApp(createPlatformApiServices());
  await app.listen(0, "127.0.0.1");
  try {
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/admin/auth/simulate-login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-user-email": "admin@company.com"
      },
      body: JSON.stringify({
        providerId: "authprov_keycloak_default_001",
        subject: "keycloak-admin-http-001",
        email: "admin.http@company.com",
        name: "Admin HTTP",
        groups: ["evcp-admins"],
        appRoles: {}
      })
    });
    const envelope = await response.json();

    assert.equal(response.status, 201);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.providerId, "authprov_keycloak_default_001");
    assert.equal(envelope.data.token.startsWith("evcp_session."), true);
  } finally {
    await app.close();
  }
});

test("platform HTTP AI governance routes verify persisted Platform sessions", async () => {
  const email = "persisted.admin@company.test";
  const coreClient = new MemoryCorePersistenceClient({
    users: [
      {
        id: "usr_persisted_admin",
        email,
        name: "Persisted Admin",
        status: "active",
        roles: [
          {
            role: {
              id: "role_admin",
              key: "admin",
              name: "Platform Admin",
              permissions: ["platform:admin"]
            }
          }
        ]
      }
    ]
  });
  const platformSessions = new PlatformSessionService(
    new MemoryPlatformSessionRepository(),
    "http-ai-governance-session-secret"
  );
  const session = await platformSessions.issue({
    id: "usr_persisted_admin",
    email,
    providerConfigId: "authprov_keycloak_default_001",
    claims: { email }
  });
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(
      new MemoryAiGovernancePersistenceClient()
    ),
    platformSessions
  };
  const app = await createPlatformApiApp(services);
  await app.listen(0, "127.0.0.1");
  try {
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/ai/providers`, {
      headers: { authorization: `Bearer ${session.token}` }
    });
    const envelope = await response.json();

    assert.equal(response.status, 200);
    assert.equal(envelope.ok, true);
    assert.deepEqual(envelope.data, []);

    const invalidSessionResponse = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { authorization: "Bearer invalid-platform-session" }
    });
    const invalidSessionEnvelope = await invalidSessionResponse.json();
    assert.equal(invalidSessionResponse.status, 401);
    assert.equal(invalidSessionEnvelope.error.code, "UNAUTHORIZED");
  } finally {
    await app.close();
  }
});

test("creator publish HTTP routes resolve persisted sessions after API restart", async () => {
  const email = "creator.restart@horizon.test";
  const userId = "usr_creator_restart";
  const projectId = "prj_creator_restart";
  const coreClient = new MemoryCorePersistenceClient({
    users: [
      {
        id: userId,
        email,
        name: "Restarted Creator",
        status: "active",
        roles: [
          {
            role: {
              id: "role_creator",
              key: "creator",
              name: "Creator",
              permissions: []
            }
          }
        ]
      }
    ],
    projects: [
      {
        id: projectId,
        name: "Restart-safe Sales Pipeline",
        status: "draft",
        ownerUserId: userId,
        appType: "Workflow App",
        businessProblem: "Sales pipeline publishing must survive API restarts",
        targetDepartment: "Sales",
        intendedUsers: ["Sales Representative", "Manager"],
        dataSensitivity: "internal",
        createdAt: new Date("2026-08-07T00:00:00.000Z")
      }
    ]
  });
  const platformSessions = new PlatformSessionService(
    new MemoryPlatformSessionRepository(),
    "creator-publish-restart-session-secret"
  );
  const session = await platformSessions.issue({
    id: userId,
    email,
    providerConfigId: "authprov_keycloak_default_001",
    claims: { email, platformRoles: ["creator"] }
  });
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    prdPersistence: createPrdRepositoryBackedService(new MemoryPrdPersistenceClient()),
    workspacePersistence: createWorkspaceRepositoryBackedService(
      new MemoryWorkspacePersistenceClient()
    ),
    publishStorePersistence: createPublishStoreRepositoryBackedService(
      new MemoryPublishStorePersistenceClient({
        users: [
          { id: userId, email, name: "Restarted Creator" },
          {
            id: "usr_sales_rep",
            email: "sales.rep@horizon.test",
            name: "Sales Representative"
          }
        ]
      })
    ),
    platformSessions
  };
  const app = await createPlatformApiApp(services);
  await app.listen(0, "127.0.0.1");
  try {
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    const headers = {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    };
    const request = (path, init = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, { headers, ...init });

    const access = await request(`/projects/${projectId}/app/users`);
    assert.equal(access.status, 200);
    assert.equal((await access.json()).ok, true);

    const role = await request(`/projects/${projectId}/app/roles`, {
      method: "POST",
      body: JSON.stringify({ key: "manager", name: "Manager" })
    });
    assert.equal(role.status, 201);

    const invitation = await request(`/projects/${projectId}/app/invitations`, {
      method: "POST",
      body: JSON.stringify({
        email: "sales.manager@horizon.test",
        roleKey: "manager",
        userType: "internal"
      })
    });
    assert.equal(invitation.status, 201);

    const accessRequest = await request(`/projects/${projectId}/app/access-requests`, {
      method: "POST",
      body: JSON.stringify({
        requesterEmail: "sales.rep@horizon.test",
        requestedRoleKey: "manager",
        reason: "Manage qualified opportunities"
      })
    });
    assert.equal(accessRequest.status, 201);
    const accessRequestEnvelope = await accessRequest.json();

    const decision = await request(`/projects/${projectId}/app/access-requests/decision`, {
      method: "POST",
      body: JSON.stringify({
        requestId: accessRequestEnvelope.data.id,
        decision: "approved"
      })
    });
    assert.equal(decision.status, 200);

    const review = await request(`/projects/${projectId}/publish/review`);
    assert.equal(review.status, 422);
    assert.doesNotMatch(JSON.stringify(await review.json()), /Unknown mock user/);
  } finally {
    await app.close();
  }
});
