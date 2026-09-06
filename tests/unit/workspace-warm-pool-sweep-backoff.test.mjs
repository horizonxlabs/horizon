import test from "node:test";
import assert from "node:assert/strict";
import { startWarmPoolSweep } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-sweep.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("positive-target sweeps preserve failed retry backoff until due and carry it forward", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  const [firstFailure] = await fixture.store.list();
  const retryAt = new Date(firstFailure.retryAfter);
  const sweep = startWarmPoolSweep(fixture.pool, { intervalMs: 10 });
  t.after(() => sweep.stop());

  fixture.setNow(new Date(retryAt.getTime() - 1));
  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  const [notDue] = await fixture.store.list();
  assert.equal(notDue.id, firstFailure.id);
  assert.equal(notDue.failureCount, 1);
  assert.equal(notDue.retryAfter, firstFailure.retryAfter);
  assert.equal(fixture.prepareAttempts, 1);

  fixture.setNow(retryAt);
  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  const [secondFailure] = await fixture.store.list();
  assert.equal(secondFailure.failureCount, 2);
  assert.equal(secondFailure.retryAfter, new Date(retryAt.getTime() + 10_000).toISOString());
  assert.equal(fixture.prepareAttempts, 2);
});

test("zero-target sweep drains failed slots instead of preserving refill backoff", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  await fixture.store.createPreparing({ id: "failed-slot", resourceKey: "failed-resource" });
  await fixture.store.markFailed("failed-slot", {
    lastError: "preview_unhealthy",
    failureCount: 3,
    retryAfter: "2026-09-05T00:05:00.000Z"
  });
  const sweep = startWarmPoolSweep(fixture.pool, { intervalMs: 10 });
  t.after(() => sweep.stop());

  t.mock.timers.tick(10);
  await new Promise(setImmediate);

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["failed-resource"]);
  assert.deepEqual(fixture.releasedBuckets, ["failed-resource"]);
});
