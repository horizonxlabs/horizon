import test from "node:test";
import assert from "node:assert/strict";
import { getOrRecoverDevContainerId } from "../../apps/platform-api/src/publish/factory.ts";

test("publish recovers an existing workspace after an API restart", async () => {
  const calls = [];
  const orchestrator = {
    getWorkspace: () => null,
    async provisionWorkspace(input) {
      calls.push(input);
      return { containerId: "dev-container-123" };
    }
  };

  const containerId = await getOrRecoverDevContainerId(orchestrator, "prj_123");

  assert.equal(containerId, "dev-container-123");
  assert.deepEqual(calls, [{ projectId: "prj_123", slug: "prj_123" }]);
});

test("publish revalidates a persisted workspace record before using its container", async () => {
  const calls = [];
  const orchestrator = {
    getWorkspace: () => ({ containerId: "stale-container" }),
    async provisionWorkspace(input) {
      calls.push(input);
      return { containerId: "recovered-container" };
    }
  };

  assert.equal(await getOrRecoverDevContainerId(orchestrator, "prj_123"), "recovered-container");
  assert.deepEqual(calls, [{ projectId: "prj_123", slug: "prj_123" }]);
});
