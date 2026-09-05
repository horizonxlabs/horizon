import test from "node:test";
import assert from "node:assert/strict";

const { resolveWorkspaceWarmPoolSize } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts"
);

test("real mode defaults the warm pool to three", () => {
  assert.equal(resolveWorkspaceWarmPoolSize({}, "real"), 3);
});

test("memory mode defaults the warm pool to zero", () => {
  assert.equal(resolveWorkspaceWarmPoolSize({}, "memory"), 0);
});

for (const value of ["-1", "1.5", "twenty-one", "21"]) {
  test(`rejects invalid warm pool size ${value}`, () => {
    assert.throws(
      () => resolveWorkspaceWarmPoolSize({ EVCP_WORKSPACE_WARM_POOL_SIZE: value }, "real"),
      /EVCP_WORKSPACE_WARM_POOL_SIZE/
    );
  });
}
