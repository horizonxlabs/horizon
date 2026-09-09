import assert from "node:assert/strict";
import test from "node:test";
import { initializeWorkspaceRuntime } from "../../apps/platform-api/src/workspace-orchestrator/runtime-startup.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("runtime startup fills warm-pool capacity before slow orphan cleanup", async () => {
  const reconcile = deferred();
  const calls = [];
  const orchestrator = {
    async hydrateRuntimeRecords(store) {
      calls.push(["hydrate", store]);
    },
    configureWarmPool(pool) {
      calls.push(["configure", pool]);
    },
    async reconcileWarmPool() {
      calls.push(["reconcile"]);
      await reconcile.promise;
    },
    async cleanupOrphanContainers() {
      calls.push(["cleanup"]);
    },
    async ensureWarmPoolCapacity() {
      calls.push(["capacity"]);
    }
  };
  const runtimeStore = {};
  const warmStore = {};
  const pool = {};

  await initializeWorkspaceRuntime(
    orchestrator,
    "postgres://runtime",
    (store) => {
      assert.equal(store, warmStore);
      return pool;
    },
    {
      createRuntimeRecordStore: async () => runtimeStore,
      createWarmSlotStore: async () => warmStore
    }
  );

  assert.deepEqual(calls, [
    ["hydrate", runtimeStore],
    ["configure", pool],
    ["reconcile"]
  ]);
  reconcile.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(-2), [["capacity"], ["cleanup"]]);
});

test("runtime startup can await maintenance for deterministic recovery", async () => {
  const calls = [];
  const orchestrator = {
    async hydrateRuntimeRecords() {
      calls.push("hydrate");
    },
    configureWarmPool() {
      calls.push("configure");
    },
    async reconcileWarmPool() {
      calls.push("reconcile");
    },
    async cleanupOrphanContainers() {
      calls.push("cleanup");
    },
    async ensureWarmPoolCapacity() {
      calls.push("capacity");
    }
  };

  await initializeWorkspaceRuntime(
    orchestrator,
    undefined,
    () => ({}),
    {
      createRuntimeRecordStore: async () => ({}),
      createWarmSlotStore: async () => ({})
    },
    { awaitMaintenance: true }
  );

  assert.deepEqual(calls, ["hydrate", "configure", "reconcile", "capacity", "cleanup"]);
});
