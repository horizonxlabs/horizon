import assert from "node:assert/strict";
import test from "node:test";

import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { DeterministicWarmSlotPersistenceClient } from "./workspace-warm-slot-persistence-fixture.mjs";

for (const implementation of ["repository", "memory"]) {
  test(`${implementation} recovers expired retry cleanup with no retry schedule and retains backoff`, async () => {
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      previewExitCode: 1,
      ...(implementation === "repository"
        ? { store: new WorkspaceWarmSlotRepositoryBackedStore(new DeterministicWarmSlotPersistenceClient()) }
        : {})
    });
    await fixture.pool.ensureCapacity();
    const [failed] = await fixture.store.list();
    const retryLease = {
      ownerId: "crashed-preparer",
      now: failed.retryAfter,
      expiresAt: "2026-09-05T00:00:06.000Z"
    };
    await fixture.store.acquireCleanup(failed.id, "failed", retryLease);
    await fixture.store.retryPreparing(failed.id, "crashed-generation-resource", retryLease);
    const cleanup = await fixture.store.acquireCleanup(failed.id, "preparing", {
      ownerId: "crashed-cleaner",
      now: "2026-09-05T00:00:06.001Z",
      expiresAt: "2026-09-05T00:00:07.000Z"
    });
    assert.equal(cleanup.retryAfter, null);
    const recovering = fixture.createPool();
    fixture.setNow(new Date("2026-09-05T00:00:06.500Z"));
    await recovering.reconcile();
    await recovering.ensureCapacity();
    assert.deepEqual(await fixture.store.list(), [cleanup], "live cleanup retains ownership");

    fixture.setNow(new Date("2026-09-05T00:00:07.001Z"));
    await recovering.reconcile();
    await recovering.ensureCapacity();

    const slots = await fixture.store.list();
    assert.equal(slots.length, 1);
    assert.equal(slots[0].state, "failed");
    assert.equal(slots[0].id, failed.id);
    assert.notEqual(slots[0].resourceKey, "crashed-generation-resource");
    assert.equal(slots[0].failureCount, 2);
    assert.equal(slots[0].retryAfter, "2026-09-05T00:00:17.001Z");
    assert.equal(fixture.prepareAttempts, 2);
  });

  test(`${implementation} stale provisioning failure cannot roll back a ready successor`, async () => {
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      previewExitCode: 1,
      operationLeaseMs: 1_000,
      ...(implementation === "repository"
        ? { store: new WorkspaceWarmSlotRepositoryBackedStore(new DeterministicWarmSlotPersistenceClient()) }
        : {})
    });
    await fixture.pool.ensureCapacity();
    const [failed] = await fixture.store.list();
    fixture.setNow(new Date(failed.retryAfter));
    const staleProvisioningStarted = Promise.withResolvers();
    const failStaleProvisioning = Promise.withResolvers();
    const createKey = fixture.deps.llmGateway.createVirtualKey;
    let pauseNextKey = true;
    fixture.deps.llmGateway.createVirtualKey = async (...args) => {
      if (pauseNextKey) {
        pauseNextKey = false;
        staleProvisioningStarted.resolve();
        await failStaleProvisioning.promise;
        throw new Error("gateway provisioning failed after takeover");
      }
      return createKey(...args);
    };
    const staleRetry = fixture.pool.ensureCapacity();
    await staleProvisioningStarted.promise;
    try {
      fixture.setNow(new Date("2026-09-05T00:00:06.001Z"));
      fixture.previewExitCode = 0;
      const successorPool = fixture.createPool();
      await successorPool.reconcile();
      await successorPool.ensureCapacity();
      const [successor] = await fixture.store.list();
      assert.equal(successor.state, "ready");
      failStaleProvisioning.resolve();
      await staleRetry;

      assert.deepEqual(await fixture.store.list(), [successor]);
      assert.equal(successor.failureCount, 1);
      assert.equal(fixture.releasedSchemas.includes(successor.resourceKey), false);
      assert.equal(fixture.releasedBuckets.includes(successor.resourceKey), false);
      assert.equal(fixture.revokedKeys.includes(successor.llmGatewayKeyId), false);
      assert.equal(fixture.docker.state.containers.length, 1);
      assert.equal(fixture.docker.state.volumes.length, 1);
    } finally {
      failStaleProvisioning.resolve();
      await staleRetry;
    }
  });
}
