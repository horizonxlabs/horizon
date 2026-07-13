import assert from "node:assert/strict";
import { test } from "node:test";

const { createRuntimePlatformApiServices, executePlatformApiRequestAsync, resolveCorePersistenceMode } = await import("../../apps/platform-api/src/app-factory.ts");

test("runtime core persistence defaults to legacy mode when env is unset", async () => {
  const services = await createRuntimePlatformApiServices({});

  assert.equal(resolveCorePersistenceMode({}), "legacy");
  assert.equal("corePersistence" in services, false);
});

test("runtime core persistence memory mode enables repository-backed core routes without database", async () => {
  const services = await createRuntimePlatformApiServices({ EVCP_CORE_PERSISTENCE: "memory" });

  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { name: "Runtime Memory Mode" }
  });
  const audit = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { projectId: created.body.data.id }
  });

  assert.equal(resolveCorePersistenceMode({ EVCP_CORE_PERSISTENCE: "memory" }), "memory");
  assert.ok(services.corePersistence);
  assert.ok(services.governedAiExecutor);
  assert.equal(created.status, 201);
  assert.match(created.body.data.id, /^prj_[0-9a-f]{32}$/);
  assert.equal(audit.body.data.length, 1);
});

test("runtime core persistence rejects unsupported modes loudly", () => {
  assert.throws(() => resolveCorePersistenceMode({ EVCP_CORE_PERSISTENCE: "sqlite" }), /Unsupported EVCP_CORE_PERSISTENCE mode/);
});
