import test from "node:test";
import assert from "node:assert/strict";

const { startIdleSweep } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/idle-sweep.ts"
);

test("idle sweep invokes stopIdleWorkspaces on interval and can be stopped", async () => {
  let calls = 0;
  let resolveSecondSweep;
  let rejectSecondSweep;
  const secondSweep = new Promise((resolve, reject) => {
    resolveSecondSweep = resolve;
    rejectSecondSweep = reject;
  });
  const fakeOrchestrator = {
    stopIdleWorkspaces: async () => {
      calls += 1;
      if (calls === 2) resolveSecondSweep();
      return [];
    }
  };
  const intervalMs = 10;
  const sweep = startIdleSweep(fakeOrchestrator, { intervalMs });
  const diagnosticTimeout = setTimeout(() => {
    rejectSecondSweep(new Error(`timed out waiting for second sweep; got ${calls}`));
  }, 1_000);

  try {
    await secondSweep;
    sweep.stop();
    const settled = calls;
    assert.ok(settled >= 2, `expected >=2 sweeps, got ${settled}`);

    // Three full intervals are enough to prove the timer was cleared without
    // coupling the precondition to event-loop scheduling latency.
    await new Promise((resolve) => setTimeout(resolve, intervalMs * 3));
    assert.equal(calls, settled, "no sweeps after stop");
  } finally {
    clearTimeout(diagnosticTimeout);
    sweep.stop();
  }
});
