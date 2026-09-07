import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceWarmPool } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool.ts";

for (const [image, version, warningCount] of [
  ["private.example:5000/repo/workspace:v1", "v2", 1],
  ["private.example:5000/repo/workspace:v2@sha256:abc", "v2", 0],
  ["private.example:5000/repo/workspace", "v2", 0],
  ["private.example:5000/repo/workspace@sha256:abc", "v2", 0],
  ["private.example:5000/repo/workspace:v1", undefined, 0]
]) {
  test(`image configuration emits ${warningCount} sanitized warnings for ${image} and ${version}`, async (t) => {
    const warning = t.mock.method(console, "warn", () => {});
    const pool = createWorkspaceWarmPool({
      targetSize: 0,
      store: {
        async list() {
          return [];
        }
      },
      deps: { image },
      env: { EVCP_VERSION: version, DATABASE_URL: "postgres://private-secret" }
    });
    await pool.getStatus();
    await pool.getStatus();
    assert.equal(warning.mock.callCount(), warningCount);
    if (warningCount) {
      const output = JSON.stringify(warning.mock.calls[0].arguments);
      assert.match(output, /platform.*workspace.*(?:differ|mismatch)/i);
      assert.doesNotMatch(output, /private|postgres|v1|v2|sha256|5000/);
    }
  });
}

const { resolveWorkspaceWarmPoolSize } =
  await import("../../apps/platform-api/src/workspace-orchestrator/warm-pool-config.ts");

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
