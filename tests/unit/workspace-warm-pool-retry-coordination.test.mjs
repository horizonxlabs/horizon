import assert from "node:assert/strict";
import test from "node:test";

import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("two managers keep one durable retry lineage through repeated cleanup races", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  const secondManager = fixture.createPool();
  await fixture.pool.ensureCapacity();
  const releaseSchema = fixture.deps.postgres.releaseSchema.bind(fixture.deps.postgres);

  for (const expectedFailureCount of [2, 3, 4]) {
    const [failed] = await fixture.store.list();
    fixture.setNow(new Date(failed.retryAfter));
    const cleanupStarted = Promise.withResolvers();
    const continueCleanup = Promise.withResolvers();
    let holdNextCleanup = true;
    fixture.deps.postgres.releaseSchema = async (resourceKey) => {
      if (holdNextCleanup) {
        holdNextCleanup = false;
        cleanupStarted.resolve();
        await continueCleanup.promise;
      }
      return releaseSchema(resourceKey);
    };

    const retry = fixture.pool.ensureCapacity();
    await cleanupStarted.promise;
    await secondManager.ensureCapacity();

    const [cleaning] = await fixture.store.list();
    assert.equal(cleaning.state, "cleaning");
    assert.equal(cleaning.failureCount, expectedFailureCount - 1);
    assert.equal(fixture.prepareAttempts, expectedFailureCount - 1);

    continueCleanup.resolve();
    await retry;

    const [retried] = await fixture.store.list();
    assert.equal((await fixture.store.list()).length, 1);
    assert.equal(retried.state, "failed");
    assert.equal(retried.failureCount, expectedFailureCount);
  }
});

test("a manager resumes an expired retry cleanup without a zero-history replacement", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  fixture.setNow(new Date(failed.retryAfter));
  await fixture.store.acquireCleanup(failed.id, "failed", {
    ownerId: "crashed-manager",
    now: failed.retryAfter,
    expiresAt: "2026-09-05T00:05:00.000Z"
  });
  fixture.setNow(new Date("2026-09-05T00:05:00.001Z"));

  await fixture.createPool().ensureCapacity();

  const slots = await fixture.store.list();
  assert.equal(slots.length, 1);
  assert.equal(slots[0].state, "failed");
  assert.equal(slots[0].failureCount, 2);
  assert.equal(slots[0].retryAfter, "2026-09-05T00:05:10.001Z");
});

test("periodic reconciliation preserves an expired retry preparation for recovery", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, previewExitCode: 1 });
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  const retryLease = {
    ownerId: "crashed-retry-manager",
    now: failed.retryAfter,
    expiresAt: "2026-09-05T00:05:00.000Z"
  };
  await fixture.store.acquireCleanup(failed.id, "failed", retryLease);
  await fixture.store.retryPreparing(failed.id, retryLease);
  fixture.setNow(new Date("2026-09-05T00:05:00.001Z"));
  const recoveringManager = fixture.createPool();

  await recoveringManager.reconcile();
  await recoveringManager.ensureCapacity();

  const slots = await fixture.store.list();
  assert.equal(slots.length, 1);
  assert.equal(slots[0].state, "failed");
  assert.equal(slots[0].failureCount, 2);
  assert.equal(slots[0].retryAfter, "2026-09-05T00:05:10.001Z");
});
