import assert from "node:assert/strict";
import test from "node:test";

import { cleanupWarmSlotResources } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-cleanup.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test(
  "capacity failure waits for every preparation before idle and cleanup",
  { timeout: 5_000 },
  async () => {
    const fixture = createWarmPoolFixture({ targetSize: 2 });
    const siblingStarted = Promise.withResolvers();
    const releaseSibling = Promise.withResolvers();
    const siblingReady = Promise.withResolvers();
    const failureRaised = Promise.withResolvers();
    const persistenceFailure = new Error("failed-state persistence unavailable");
    const provisionSchema = fixture.deps.postgres.provisionSchema;
    fixture.deps.postgres.provisionSchema = async (resourceKey) => {
      if (resourceKey === "warm-resource-2") {
        siblingStarted.resolve();
        await releaseSibling.promise;
      }
      return provisionSchema(resourceKey);
    };
    let keySequence = 0;
    fixture.deps.llmGateway.createVirtualKey = async () => {
      keySequence += 1;
      return { keyId: `batch-key-${keySequence}`, key: `batch-secret-${keySequence}` };
    };
    const markReady = fixture.store.markReady;
    fixture.store.markReady = async (id, patch, lease) => {
      if (id === "warm_slot_1") throw new Error("ready-state persistence unavailable");
      const ready = await markReady(id, patch, lease);
      siblingReady.resolve();
      return ready;
    };
    const markFailed = fixture.store.markFailed;
    fixture.store.markFailed = async (id, patch, lease) => {
      if (id === "warm_slot_1") {
        failureRaised.resolve();
        throw persistenceFailure;
      }
      return markFailed(id, patch, lease);
    };
    const unhandled = [];
    const observeUnhandled = (error) => unhandled.push(error);
    process.on("unhandledRejection", observeUnhandled);
    let capacitySettled = false;
    const capacity = fixture.pool.ensureCapacity().then(
      () => {
        capacitySettled = true;
        return null;
      },
      (error) => {
        capacitySettled = true;
        return error;
      }
    );
    await Promise.all([siblingStarted.promise, failureRaised.promise]);
    let idle = false;
    const draining = fixture.pool.waitForIdle().then(() => {
      idle = true;
    });
    const cleanup = async () => {
      for (const slot of await fixture.store.list()) {
        await cleanupWarmSlotResources(fixture.deps, slot);
        await fixture.store.remove(slot.id);
      }
    };
    try {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(idle, false, "idle must wait for the blocked sibling despite another failure");
      assert.equal(capacitySettled, false, "capacity must not reject before sibling work finishes");
      releaseSibling.resolve();
      assert.equal(await capacity, persistenceFailure, "the batch still surfaces its failure");
      await draining;
      assert.equal((await fixture.pool.getStatus()).ready, 1);
      await cleanup();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal((await fixture.store.list()).length, 0);
      assert.equal(fixture.docker.state.containers.length, 0);
      assert.equal(fixture.docker.state.volumes.length, 0);
      assert.deepEqual([...new Set(fixture.releasedSchemas)].sort(), [
        "warm-resource-1",
        "warm-resource-2"
      ]);
      assert.deepEqual([...new Set(fixture.releasedBuckets)].sort(), [
        "warm-resource-1",
        "warm-resource-2"
      ]);
      assert.deepEqual([...new Set(fixture.revokedKeys)].sort(), ["batch-key-1", "batch-key-2"]);
      assert.deepEqual(unhandled, []);
    } finally {
      releaseSibling.resolve();
      await siblingReady.promise;
      await capacity;
      await draining;
      await cleanup();
      process.removeListener("unhandledRejection", observeUnhandled);
    }
  }
);
