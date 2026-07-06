// tests/unit/workspace-orchestrator-state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { canTransition, assertTransition, WorkspaceStateError } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/state.ts"
);

test("allows the documented lifecycle transitions", () => {
  assert.equal(canTransition("provisioning", "running"), true);
  assert.equal(canTransition("provisioning", "failed"), true);
  assert.equal(canTransition("running", "idle"), true);
  assert.equal(canTransition("idle", "running"), true);
  assert.equal(canTransition("running", "archived"), true);
  assert.equal(canTransition("idle", "archived"), true);
});

test("rejects undocumented transitions", () => {
  assert.equal(canTransition("archived", "running"), false);
  assert.equal(canTransition("failed", "idle"), false);
  assert.equal(canTransition("idle", "provisioning"), false);
});

test("assertTransition throws WorkspaceStateError with both states in message", () => {
  assert.throws(
    () => assertTransition("archived", "running"),
    (err) => err instanceof WorkspaceStateError && /archived/.test(err.message) && /running/.test(err.message)
  );
});
