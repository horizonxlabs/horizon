import assert from "node:assert/strict";
import test from "node:test";

import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { DeterministicWarmSlotPersistenceClient } from "./workspace-warm-slot-persistence-fixture.mjs";

const firstLease = {
  ownerId: "first-owner",
  now: "2026-09-05T00:00:05.000Z",
  expiresAt: "2026-09-05T00:00:06.000Z"
};
const successorLease = {
  ownerId: "successor-owner",
  now: "2026-09-05T00:00:06.001Z",
  expiresAt: "2026-09-05T00:05:06.001Z"
};

for (const implementation of ["repository", "memory"]) {
  test(`${implementation} retry response keeps its own generation after a successor takes over`, async () => {
    const client = new DeterministicWarmSlotPersistenceClient();
    const store = implementation === "repository"
      ? new WorkspaceWarmSlotRepositoryBackedStore(client)
      : createWarmPoolFixture({ targetSize: 1 }).store;
    await store.createPreparing({ id: "lineage", resourceKey: "original-resource" });
    await store.markFailed("lineage", {
      lastError: "preview_unhealthy", failureCount: 3, retryAfter: firstLease.now
    });
    await store.acquireCleanup("lineage", "failed", firstLease);
    const transitionCompleted = Promise.withResolvers();
    const releaseResponse = Promise.withResolvers();
    if (implementation === "repository") {
      client.afterMutation = async ({ data }) => {
        if (data.resourceKey === "first-resource") {
          transitionCompleted.resolve();
          await releaseResponse.promise;
        }
      };
    } else {
      const retryPreparing = store.retryPreparing.bind(store);
      store.retryPreparing = async (...args) => {
        const row = await retryPreparing(...args);
        if (args[1] === "first-resource") {
          transitionCompleted.resolve();
          await releaseResponse.promise;
        }
        return row;
      };
    }
    const delayedResponse = store.retryPreparing("lineage", "first-resource", firstLease);
    await transitionCompleted.promise;
    try {
      await store.acquireCleanup("lineage", "preparing", successorLease);
      await store.retryPreparing("lineage", "successor-resource", successorLease);
      releaseResponse.resolve();
      const first = await delayedResponse;
      assert.equal(first.resourceKey, "first-resource");
      assert.equal(first.operationOwner, "first-owner");
      assert.equal(first.failureCount, 3);
      assert.equal((await store.list())[0].resourceKey, "successor-resource");
    } finally {
      releaseResponse.resolve();
      await delayedResponse;
    }
  });

  test(`${implementation} pool dispatches no provisioning from an expired retry response`, async () => {
    const client = new DeterministicWarmSlotPersistenceClient();
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      previewExitCode: 1,
      operationLeaseMs: 1_000,
      ...(implementation === "repository"
        ? { store: new WorkspaceWarmSlotRepositoryBackedStore(client) }
        : {})
    });
    await fixture.pool.ensureCapacity();
    const [failed] = await fixture.store.list();
    fixture.setNow(new Date(failed.retryAfter));
    const transitionCompleted = Promise.withResolvers();
    const releaseResponse = Promise.withResolvers();
    let delayNextRetry = true;
    const pauseRetry = async () => {
      if (!delayNextRetry) return;
      delayNextRetry = false;
      transitionCompleted.resolve();
      await releaseResponse.promise;
    };
    if (implementation === "repository") {
      client.afterMutation = async ({ data }) => {
        if (data.state === "preparing") await pauseRetry();
      };
    } else {
      const retryPreparing = fixture.store.retryPreparing.bind(fixture.store);
      fixture.store.retryPreparing = async (...args) => {
        const result = await retryPreparing(...args);
        await pauseRetry();
        return result;
      };
    }
    const staleRetry = fixture.pool.ensureCapacity();
    await transitionCompleted.promise;
    try {
      fixture.setNow(new Date("2026-09-05T00:00:06.001Z"));
      fixture.previewExitCode = 0;
      const successorPool = fixture.createPool();
      await successorPool.reconcile();
      await successorPool.ensureCapacity();
      const [successor] = await fixture.store.list();
      assert.equal(successor.state, "ready");
      assert.equal(fixture.prepareAttempts, 2);

      releaseResponse.resolve();
      await staleRetry;

      assert.equal(fixture.prepareAttempts, 2, "expired owner must not create external resources");
      assert.deepEqual(await fixture.store.list(), [successor]);
      assert.equal(fixture.releasedSchemas.includes(successor.resourceKey), false);
      assert.equal(fixture.releasedBuckets.includes(successor.resourceKey), false);
      assert.equal(fixture.revokedKeys.includes(successor.llmGatewayKeyId), false);
      assert.equal(fixture.docker.state.volumes.length, 1);
    } finally {
      releaseResponse.resolve();
      await staleRetry;
    }
  });
}
