import test from "node:test";
import assert from "node:assert/strict";

const { resolveWorkspaceAdapterMode, createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("resolveWorkspaceAdapterMode returns real only when the flag is exactly '1'", () => {
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "1" }), "real");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "0" }), "memory");
  assert.equal(resolveWorkspaceAdapterMode({}), "memory");
});

test("memory mode still builds an orchestrator without touching real infra", () => {
  // Constructing in memory mode must not throw and must not require pg/minio env.
  // (Guards that wiring real adapters didn't break the default test path.)
  assert.equal(typeof createDefaultWorkspaceOrchestrator, "function");
  const orchestrator = createDefaultWorkspaceOrchestrator({ env: {} });
  assert.equal(typeof orchestrator.provisionWorkspace, "function");
});
