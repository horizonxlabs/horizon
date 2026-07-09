import assert from "node:assert/strict";
import { test } from "node:test";

const { executePlatformApiRequestAsync } = await import(
  "../../apps/platform-api/src/app-factory.ts"
);
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);
const { MemoryCorePersistenceClient, createCoreRepositoryBackedService } = await import(
  "../../apps/platform-api/src/persistence/core-repositories.ts"
);

test("core API persistence mode runs auth project and audit routes as one request flow", async () => {
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(new MemoryCorePersistenceClient())
  };

  const me = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/auth/me",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: {
      name: "Contract Review",
      appType: "Workflow App",
      intendedUsers: ["Legal Ops", "Requester"]
    }
  });
  const projects = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  const filteredAudit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { projectId: created.body.data.id }
  });

  assert.equal(me.body.ok, true);
  assert.equal(me.body.data.user.role, "creator");
  assert.equal(created.status, 201);
  assert.match(created.body.data.id, /^prj_[0-9a-f]{32}$/);
  assert.equal(projects.body.ok, true);
  assert.equal(projects.body.data.length, 1);
  assert.equal(filteredAudit.body.ok, true);
  assert.deepEqual(
    filteredAudit.body.data.map((event) => event.action),
    ["project.created"]
  );
});
