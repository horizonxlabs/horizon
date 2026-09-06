import test from "node:test";
import assert from "node:assert/strict";
import { WorkspaceWarmSlotRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-warm-slot-repository.ts";
import { DeterministicWarmSlotPersistenceClient } from "./workspace-warm-slot-persistence-fixture.mjs";

test("preparation intent survives slot retirement and repository recreation without holding credentials", async () => {
  const client = new DeterministicWarmSlotPersistenceClient();
  const store = new WorkspaceWarmSlotRepositoryBackedStore(client);
  await store.createPreparing({ id: "slot1", resourceKey: "warm-retired" });
  const intent = { resourceKey: "warm-retired", slotId: "slot1", operationOwner: "attempt1" };
  await store.preparations.create(intent);
  await store.remove("slot1");
  const restarted = new WorkspaceWarmSlotRepositoryBackedStore(client);
  assert.deepEqual(await restarted.preparations.list(), [{ ...intent, settled: false }]);
  await restarted.preparations.settle(intent.resourceKey);
  assert.deepEqual(await store.preparations.list(), [{ ...intent, settled: true }]);
  await restarted.preparations.remove(intent.resourceKey);
  assert.deepEqual(await store.preparations.list(), []);
});
