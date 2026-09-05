import test from "node:test";
import assert from "node:assert/strict";
import { startWarmPoolSweep } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts";

test("refill ticks never overlap and stop prevents later refills", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  let finish;
  const pool = {
    async reconcile() {},
    async ensureCapacity() {
      calls += 1;
      await new Promise((resolve) => {
        finish = resolve;
      });
    }
  };
  const sweep = startWarmPoolSweep(pool, { intervalMs: 10 });
  t.after(() => sweep.stop());
  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  t.mock.timers.tick(100);
  assert.equal(calls, 1);
  finish();
  await new Promise(setImmediate);
  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  sweep.stop();
  finish();
  await new Promise(setImmediate);
  t.mock.timers.tick(100);
  assert.equal(calls, 2);
});

test("sweep reconciles before capacity refill and retries a failed reconciliation", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const calls = [];
  const failures = [];
  let reconcileAttempts = 0;
  const sweep = startWarmPoolSweep(
    {
      async reconcile() {
        calls.push("reconcile");
        reconcileAttempts += 1;
        if (reconcileAttempts === 1) throw new Error("temporary reconciliation failure");
      },
      async ensureCapacity() {
        calls.push("ensureCapacity");
      }
    },
    { intervalMs: 10, onError: (error) => failures.push(error) }
  );
  t.after(() => sweep.stop());

  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["reconcile"]);
  assert.equal(failures.length, 1);

  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["reconcile", "reconcile", "ensureCapacity"]);
});
