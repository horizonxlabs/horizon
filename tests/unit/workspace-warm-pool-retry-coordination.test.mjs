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

  const recoveringManager = fixture.createPool();
  await recoveringManager.reconcile();
  await recoveringManager.ensureCapacity();

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
  await fixture.store.retryPreparing(failed.id, "retry-preparation-resource", retryLease);
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

test("a delayed stale cleaner cannot delete a successor retry generation", async () => {
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    previewExitCode: 1,
    operationLeaseMs: 10
  });
  await fixture.pool.ensureCapacity();
  const [failed] = await fixture.store.list();
  fixture.setNow(new Date(failed.retryAfter));
  const staleDeletesStarted = Promise.withResolvers();
  const resumeStaleDeletes = Promise.withResolvers();
  let staleDeleteCount = 0;
  let pauseStaleDeletes = true;
  const pauseFirstCleanup = (operation) => async (...args) => {
    if (pauseStaleDeletes) {
      staleDeleteCount += 1;
      if (staleDeleteCount === 4) staleDeletesStarted.resolve();
      await resumeStaleDeletes.promise;
    }
    return operation(...args);
  };
  fixture.deps.postgres.releaseSchema = pauseFirstCleanup(fixture.deps.postgres.releaseSchema);
  fixture.deps.objectStorage.releaseBucket = pauseFirstCleanup(
    fixture.deps.objectStorage.releaseBucket
  );
  fixture.docker.removeVolume = pauseFirstCleanup(fixture.docker.removeVolume);
  fixture.deps.llmGateway.revokeVirtualKey = pauseFirstCleanup(fixture.deps.llmGateway.revokeVirtualKey);

  const staleRetry = fixture.pool.ensureCapacity();
  await staleDeletesStarted.promise;
  fixture.setNow(new Date("2026-09-05T00:00:05.011Z"));
  fixture.previewExitCode = 0;
  pauseStaleDeletes = false;
  const successorManager = fixture.createPool();
  await successorManager.reconcile();
  await successorManager.ensureCapacity();

  const [successor] = await fixture.store.list();
  assert.equal(successor.id, failed.id);
  assert.notEqual(successor.resourceKey, failed.resourceKey);
  assert.equal(successor.state, "ready");
  assert.notEqual(successor.llmGatewayKeyId, failed.llmGatewayKeyId);
  resumeStaleDeletes.resolve();
  await staleRetry;

  assert.equal((await fixture.store.list())[0].resourceKey, successor.resourceKey);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.equal(fixture.releasedSchemas.includes(successor.resourceKey), false);
  assert.equal(fixture.releasedBuckets.includes(successor.resourceKey), false);
  assert.equal(fixture.revokedKeys.includes(successor.llmGatewayKeyId), false);
});
