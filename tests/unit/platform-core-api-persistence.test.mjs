import assert from "node:assert/strict";
import { test } from "node:test";

const { executePlatformApiRequestAsync } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { MemoryCorePersistenceClient, createCoreRepositoryBackedService } = await import("../../apps/platform-api/src/persistence/core-repositories.ts");

function createPersistenceServices() {
  return {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(new MemoryCorePersistenceClient())
  };
}

test("persistence-backed /auth/me resolves repository user and records auth audit", async () => {
  const services = createPersistenceServices();

  const response = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/auth/me",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const audit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { action: "auth.me" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.data.user.email, "creator@company.com");
  assert.equal(response.body.data.user.role, "creator");
  assert.equal(audit.body.ok, true);
  assert.equal(audit.body.data.length, 1);
  assert.equal(audit.body.data[0].resourceType, "platform_user");
});

test("persistence-backed project routes create list and audit through repositories", async () => {
  const services = createPersistenceServices();

  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: {
      name: "Procurement Intake",
      targetDepartment: "Procurement",
      dataSensitivity: "confidential"
    }
  });
  const createdId = created.body.data.id;
  const listed = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const legacyList = services.projects.listProjects(services.identity.getUserByEmail("creator@company.com"));
  const audit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { projectId: createdId, action: "project.created" }
  });

  assert.equal(created.status, 201);
  assert.match(createdId, /^prj_[0-9a-f]{32}$/);
  assert.deepEqual(listed.body.data.map((project) => project.name), ["Procurement Intake"]);
  assert.equal(legacyList.some((project) => project.id === createdId), false);
  assert.equal(audit.body.data.length, 1);
  assert.equal(audit.body.data[0].metadata.projectId, createdId);
});

test("persistence-backed project delete cleans the workspace and removes the project", async () => {
  const services = createPersistenceServices();
  const headers = { "x-mock-user-email": "creator@company.com" };
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers,
    body: { name: "Temporary Project" }
  });
  const projectId = created.body.data.id;
  await services.workspaceOrchestrator.provisionWorkspace({ projectId, slug: "temporary-project" });

  const deleted = await executePlatformApiRequestAsync(services, {
    method: "DELETE",
    path: `/projects/${projectId}`,
    headers
  });
  const listed = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/projects",
    headers
  });

  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: projectId, deleted: true });
  assert.equal(services.workspaceOrchestrator.getWorkspace(projectId), null);
  assert.deepEqual(listed.body.data, []);
});

test("persistence-backed core routes preserve legacy role and auth failures", async () => {
  const services = createPersistenceServices();

  const missingAuth = await executePlatformApiRequestAsync(services, { method: "GET", path: "/auth/me" });
  const endUserCreate = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "user@company.com" },
    body: { name: "Blocked" }
  });

  assert.equal(missingAuth.status, 401);
  assert.equal(missingAuth.body.error.code, "UNAUTHORIZED");
  assert.equal(endUserCreate.status, 403);
  assert.equal(endUserCreate.body.error.code, "FORBIDDEN");
});
