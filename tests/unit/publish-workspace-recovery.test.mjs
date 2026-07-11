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

test("publish uses the live workspace record without recovering it", async () => {
  const orchestrator = {
    getWorkspace: () => ({ containerId: "live-container" }),
    async provisionWorkspace() {
      throw new Error("should not recover a live workspace");
    }
  };

  assert.equal(await getOrRecoverDevContainerId(orchestrator, "prj_123"), "live-container");
});
