import test from "node:test";
import assert from "node:assert/strict";
import { startWarmPoolSweep } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts";

test("refill ticks never overlap and stop prevents later refills", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  let finish;
  const pool = {
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
  await Promise.resolve();
  assert.equal(calls, 1);
  t.mock.timers.tick(100);
  assert.equal(calls, 1);
  finish();
  await new Promise(setImmediate);
  t.mock.timers.tick(10);
  await Promise.resolve();
  assert.equal(calls, 2);
  sweep.stop();
  finish();
  await new Promise(setImmediate);
  t.mock.timers.tick(100);
  assert.equal(calls, 2);
});
