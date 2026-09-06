import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { AtomicCapacityPersistenceClient } from "./workspace-warm-slot-persistence-fixture.mjs";

for (const implementation of ["repository", "memory"]) {
  test(`${implementation} reservation includes a lineage that fails after another replica's snapshot`, async () => {
    const fixture = createWarmPoolFixture({
      targetSize: 1,
      previewExitCode: 1,
      ...(implementation === "repository"
        ? {
            store: new WorkspaceWarmSlotRepositoryBackedStore(new AtomicCapacityPersistenceClient())
          }
        : {})
    });
    const preparing = Promise.withResolvers();
    const finishPreparation = Promise.withResolvers();
    const exec = fixture.docker.execInContainer;
    fixture.docker.execInContainer = async (...args) => {
      preparing.resolve();
      await finishPreparation.promise;
      return exec(...args);
    };
    const first = fixture.pool.ensureCapacity();
    await preparing.promise;
    const reserving = Promise.withResolvers();
    const finishReservation = Promise.withResolvers();
    const reserve = fixture.store.reservePreparing.bind(fixture.store);
    fixture.store.reservePreparing = async (...args) => {
      reserving.resolve();
      await finishReservation.promise;
      return reserve(...args);
    };
    const second = fixture.createPool().ensureCapacity();
    await reserving.promise;
    finishPreparation.resolve();
    await first;
    const [failed] = await fixture.store.list();
    assert.equal(failed.state, "failed");
    fixture.previewExitCode = 0;
    finishReservation.resolve();
    await second;
    assert.equal(fixture.prepareAttempts, 1, "failed lineage occupies target until its due retry");
    assert.equal((await fixture.store.list()).length, 1);
    fixture.setNow(new Date(failed.retryAfter));
    await fixture.createPool().ensureCapacity();
    const rows = await fixture.store.list();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, failed.id);
    assert.equal(rows[0].state, "ready");
    assert.equal(rows[0].failureCount, 1);
  });
}
