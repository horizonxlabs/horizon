import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";

// Minimal orchestrator stub
function orch(containerId) {
  return {
    getWorkspace: (p) => (containerId ? { id: `ws-${p}`, containerId } : null),
    markActivity: () => {}
  };
}

test("memory mode still builds a generation service without real infra", () => {
  const svc = createDefaultGenerationService({ orchestrator: orch("c1"), env: {} });
  assert.equal(typeof svc.runTurn, "function");
});

test("real mode requires no throwing docker placeholder (constructs cleanly)", () => {
  // In real mode with a base URL set, the factory must build a real socket engine
  // internally rather than the throwing placeholder. Constructing must not throw.
  const svc = createDefaultGenerationService({
    orchestrator: orch("c1"),
    env: { EVCP_WORKSPACE_REAL_ADAPTERS: "1", EVCP_LITELLM_BASE_URL: "http://litellm:4000", EVCP_LITELLM_MASTER_KEY: "sk-master" }
  });
  assert.equal(typeof svc.runTurn, "function");
});
