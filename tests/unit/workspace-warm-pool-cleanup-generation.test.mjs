import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { DeterministicWarmSlotPersistenceClient } from "./workspace-warm-slot-persistence-fixture.mjs";

for (const implementation of ["repository", "memory"]) {
  test(`${implementation} stale cleanup cannot acquire a replacement generation after its inspection`, async () => {
    const client = new DeterministicWarmSlotPersistenceClient();
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      cleanupFailure: "schema",
      ...(implementation === "repository"
        ? { store: new WorkspaceWarmSlotRepositoryBackedStore(client) }
        : {})
    });
    fixture.deps.image = "repo/evcp-workspace-next:v1";
    await fixture.pool.ensureCapacity();
    const [original] = await fixture.store.list();
    fixture.deps.image = "repo/evcp-workspace-next:v2";
    const atAcquisition = Promise.withResolvers();
    const resumeAcquisition = Promise.withResolvers();
    const acquire = fixture.store.acquireCleanup.bind(fixture.store);
    let delayNextAcquisition = true;
    let delayedAcquisition;
    const pause = async () => {
      atAcquisition.resolve();
      await resumeAcquisition.promise;
    };
    if (implementation === "repository") {
      const updateMany = client.workspaceWarmSlot.updateMany;
      let delayNextMutation = true;
      client.workspaceWarmSlot.updateMany = async (args) => {
        if (args.data.state === "cleaning" && delayNextMutation) {
          delayNextMutation = false;
          // Pause at the database write, after any application-level preflight reads.
          await pause();
        }
        return updateMany(args);
      };
    }
    fixture.store.acquireCleanup = async (...args) => {
      if (!delayNextAcquisition) return acquire(...args);
      delayNextAcquisition = false;
      if (implementation === "memory") await pause();
      delayedAcquisition = await acquire(...args);
      return delayedAcquisition;
    };
    const delayedReconcile = fixture.pool.reconcile();
    await atAcquisition.promise;
    try {
      // Another manager quarantines a partial cleanup, then retries the same durable row.
      const successorPool = fixture.createPool();
      await successorPool.reconcile();
      const [failed] = await fixture.store.list();
      assert.equal(failed.state, "failed");
      fixture.setNow(new Date(failed.retryAfter));
      await successorPool.ensureCapacity();
      const [successor] = await fixture.store.list();
      assert.equal(successor.id, original.id);
      assert.notEqual(successor.resourceKey, original.resourceKey);
      assert.equal(successor.state, "ready");
      assert.equal(fixture.docker.state.containers[0].spec.image, fixture.deps.image);
      const containers = structuredClone(fixture.docker.state.containers);
      const volumes = structuredClone(fixture.docker.state.volumes);
      const schemas = [...fixture.releasedSchemas];
      const buckets = [...fixture.releasedBuckets];
      const keys = [...fixture.revokedKeys];

      resumeAcquisition.resolve();
      await delayedReconcile;

      assert.equal(delayedAcquisition, null, "cleanup CAS must reject the new resource generation");
      assert.deepEqual(await fixture.store.list(), [successor]);
      assert.deepEqual(fixture.docker.state.containers, containers);
      assert.deepEqual(fixture.docker.state.volumes, volumes);
      assert.deepEqual(fixture.releasedSchemas, schemas);
      assert.deepEqual(fixture.releasedBuckets, buckets);
      assert.deepEqual(fixture.revokedKeys, keys);
    } finally {
      resumeAcquisition.resolve();
      await delayedReconcile;
    }
  });
}
