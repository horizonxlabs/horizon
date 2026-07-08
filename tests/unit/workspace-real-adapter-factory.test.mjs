import test from "node:test";
import assert from "node:assert/strict";

const { resolveWorkspaceAdapterMode, createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("adapter mode defaults to memory and flips to real via env", () => {
  assert.equal(resolveWorkspaceAdapterMode({}), "memory");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "1" }), "real");
  assert.equal(resolveWorkspaceAdapterMode({ EVCP_WORKSPACE_REAL_ADAPTERS: "0" }), "memory");
});

test("memory mode still provisions against fakes (no infra)", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj-demo-app",
    slug: "demo-app"
  });
  assert.equal(record.state, "running");
});

test("real mode builds an orchestrator without throwing at construction", () => {
  const orchestrator = createDefaultWorkspaceOrchestrator({
    env: {
      EVCP_WORKSPACE_REAL_ADAPTERS: "1",
      EVCP_LITELLM_BASE_URL: "http://litellm:4000",
      EVCP_LITELLM_MASTER_KEY: "sk-master",
      EVCP_WORKSPACE_SECRET_KEY: "0".repeat(64)
    }
  });
  assert.equal(typeof orchestrator.provisionWorkspace, "function");
});
