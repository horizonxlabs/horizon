import test from "node:test";
import assert from "node:assert/strict";

const { startIdleSweep } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts"
);

test("idle sweep invokes stopIdleWorkspaces on interval and can be stopped", async () => {
  let calls = 0;
  const fakeOrchestrator = {
    stopIdleWorkspaces: async () => {
      calls += 1;
      return [];
    }
  };
  const sweep = startIdleSweep(fakeOrchestrator, { intervalMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 35));
  sweep.stop();
  const settled = calls;
  assert.ok(settled >= 2, `expected >=2 sweeps, got ${settled}`);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, settled, "no sweeps after stop");
});
