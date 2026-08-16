import test from "node:test";
import assert from "node:assert/strict";

const { resolveWorkspaceAgentMode } =
  await import("../../apps/platform-api/src/workspace-agent-mode.ts");

test("workspace agent mode defaults missing and unknown values to auto", () => {
  assert.equal(resolveWorkspaceAgentMode(undefined), "auto");
  assert.equal(resolveWorkspaceAgentMode({}), "auto");
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "anything-else" }), "auto");
});

test("workspace agent mode preserves explicit and legacy modes", () => {
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "plan" }), "plan");
  assert.equal(resolveWorkspaceAgentMode({ agentMode: "build" }), "build");
  assert.equal(resolveWorkspaceAgentMode({ workspaceMode: "plan" }), "plan");
  assert.equal(resolveWorkspaceAgentMode({ workspaceMode: "build" }), "build");
});
