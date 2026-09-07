import test from "node:test";
import assert from "node:assert/strict";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import {
  cleanupOrphanWorkspaceResources,
  workspaceWarmResourceLabels
} from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

test("reconcile persists a discovered container owner for a later refill cleanup retry", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  await fixture.store.createPreparing({ id: "slot-1", resourceKey: "warm-stale" });
  const { containerId } = await fixture.docker.createContainer({
    name: "evcp-ws-warm-stale",
    env: [],
    labels: workspaceWarmResourceLabels("slot-1")
  });
  const remove = fixture.docker.removeContainer;
  fixture.docker.removeContainer = async () => {
    throw new Error("docker unavailable");
  };
  await fixture.pool.reconcile();
  const [failed] = await fixture.store.list();
  assert.equal(failed.state, "failed");
  assert.equal(failed.containerId, containerId);
  fixture.docker.removeContainer = remove;
  fixture.setNow(new Date("2026-09-05T00:01:00Z"));
  await fixture.pool.ensureCapacity();
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal((await fixture.store.list()).length, 0);
});

test("a second manager cannot reconcile a preparation with a live durable owner", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  const exec = fixture.docker.execInContainer;
  let releaseHealth;
  const healthGate = new Promise((resolve) => {
    releaseHealth = resolve;
  });
  fixture.docker.execInContainer = async (...args) => {
    await healthGate;
    return exec(...args);
  };
  const preparing = fixture.pool.ensureCapacity();
  await new Promise(setImmediate);
  await fixture.createPool().reconcile();
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
  releaseHealth();
  await preparing;
  assert.equal((await fixture.store.list())[0].state, "ready");
});

test("preparation renews its durable operation owner while readiness is pending", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const fixture = createWarmPoolFixture({ targetSize: 1, operationLeaseMs: 30 });
  const exec = fixture.docker.execInContainer;
  let releaseHealth;
  const healthGate = new Promise((resolve) => {
    releaseHealth = resolve;
  });
  fixture.docker.execInContainer = async (...args) => {
    await healthGate;
    return exec(...args);
  };

  const preparing = fixture.pool.ensureCapacity();
  await new Promise(setImmediate);
  fixture.setNow(new Date("2026-09-05T00:00:00.020Z"));
  t.mock.timers.tick(10);
  await new Promise(setImmediate);

  const [renewed] = await fixture.store.list();
  assert.equal(renewed.operationExpiresAt, "2026-09-05T00:00:00.050Z");
  releaseHealth();
  await preparing;
  assert.equal((await fixture.store.list())[0].state, "ready");
});

test("a second manager preserves a claim protected by a live project lease", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords: runtimeStore });
  await fixture.pool.ensureCapacity();
  await runtimeStore.provisioningLeases.acquire("project-1", "live-owner", 300_000);
  await fixture.pool.claim("project-1");

  await fixture.createPool().reconcile();

  const [slot] = await fixture.store.list();
  assert.equal(slot.state, "claiming");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("a claim that wins during a ready health check fences reconciliation cleanup", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords: runtimeStore });
  await fixture.pool.ensureCapacity();
  let releaseHealth;
  const healthGate = new Promise((resolve) => {
    releaseHealth = resolve;
  });
  fixture.docker.execInContainer = async () => {
    await healthGate;
    return { stdout: "", stderr: "unhealthy", exitCode: 1 };
  };
  const reconciling = fixture.createPool().reconcile();
  await new Promise(setImmediate);
  await runtimeStore.provisioningLeases.acquire("project-1", "live-owner", 300_000);
  assert.ok(await fixture.pool.claim("project-1"));
  releaseHealth();

  await reconciling;

  const [slot] = await fixture.store.list();
  assert.equal(slot.state, "claiming");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("expired claim ownership allows exactly one reconciler to clean", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({ targetSize: 1, runtimeRecords: runtimeStore });
  await fixture.pool.ensureCapacity();
  await runtimeStore.provisioningLeases.acquire("project-1", "crashed-owner", 1_000);
  await fixture.pool.claim("project-1");
  fixture.previewExitCode = 1;
  runtime.advance(1_001);

  await Promise.all([fixture.pool.reconcile(), fixture.createPool().reconcile()]);

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
  assert.deepEqual(fixture.revokedKeys, ["key-1"]);
});

test("expired preparation ownership allows exactly one reconciler to clean", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  await fixture.store.createPreparing(
    { id: "slot-1", resourceKey: "warm-stale" },
    {
      ownerId: "crashed-preparer",
      now: "2026-09-04T23:54:59.000Z",
      expiresAt: "2026-09-05T00:00:00.000Z"
    }
  );
  await fixture.docker.ensureVolume(
    "evcp-ws-warm-stale-data",
    workspaceWarmResourceLabels("slot-1")
  );
  await fixture.docker.createContainer({
    name: "evcp-ws-warm-stale",
    env: [],
    labels: workspaceWarmResourceLabels("slot-1")
  });

  await Promise.all([fixture.pool.reconcile(), fixture.createPool().reconcile()]);

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["warm-stale"]);
  assert.deepEqual(fixture.releasedBuckets, ["warm-stale"]);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
});

test("reconcile rechecks runtime ownership after acquiring cleanup ownership", async () => {
  let assigned = false;
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: {
      provisioningLeases: availableProjectLeases,
      async list() {
        return !assigned
          ? []
          : [{ record: { projectId: "project-1", resourceKey: "warm-resource-1" } }];
      }
    }
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  fixture.previewExitCode = 1;
  const acquireCleanup = fixture.store.acquireCleanup.bind(fixture.store);
  fixture.store.acquireCleanup = async (...args) => {
    const owned = await acquireCleanup(...args);
    if (owned) assigned = true;
    return owned;
  };

  await fixture.createPool().reconcile();

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
});

test("concurrent reconciliation calls collapse into one pass", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  fixture.audits.length = 0;
  await Promise.all([fixture.pool.reconcile(), fixture.pool.reconcile()]);
  assert.equal(
    fixture.audits.filter((event) => event.action === "workspace.pool_reconciled").length,
    1
  );
});

test("orphan cleanup preserves warm-labelled resources transferred to a durable runtime", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const removed = await cleanupOrphanWorkspaceResources({
    docker: fixture.docker,
    activeProjectIds: new Set(["project-1"]),
    activeWarmSlotIds: new Set(),
    activeResourceKeys: new Set(["warm-resource-1"]),
    isWarmResourceOwned: async () => false
  });
  assert.deepEqual(removed, []);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
});

test("orphan cleanup preserves durable warm slots and removes unowned warm resources", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  await fixture.docker.createContainer({
    name: "evcp-ws-warm-orphan",
    env: [],
    labels: workspaceWarmResourceLabels("orphan")
  });
  await fixture.docker.ensureVolume(
    "evcp-ws-warm-orphan-data",
    workspaceWarmResourceLabels("orphan")
  );
  const removed = await cleanupOrphanWorkspaceResources({
    docker: fixture.docker,
    activeProjectIds: new Set(),
    activeWarmSlotIds: new Set(["warm_slot_1"]),
    isWarmResourceOwned: (key) => fixture.pool.isResourceOwned(key)
  });
  assert.deepEqual(removed, ["evcp-ws-warm-orphan", "evcp-ws-warm-orphan-data"]);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
});

test("reconcile emits one aggregate audit with no slot identifiers or credentials", async () => {
  const runtime = createRuntimeLeaseFixture();
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: runtime.createStore()
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  runtime.deleteProject("project-1");
  fixture.audits.length = 0;
  await fixture.pool.reconcile();
  assert.deepEqual(fixture.audits, [
    {
      action: "workspace.pool_reconciled",
      projectId: "workspace-pool",
      metadata: {
        target: 1,
        preparing: 0,
        ready: 0,
        claiming: 1,
        failed: 0,
        preserved: 0,
        retired: 0,
        cleaned: 1,
        cleanupFailed: 0
      }
    }
  ]);
});

test("reconcile finds a preparing container created before its identifier was persisted", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  await fixture.store.createPreparing({ id: "slot-1", resourceKey: "warm-stale" });
  await fixture.docker.createContainer({
    name: "evcp-ws-warm-stale",
    env: [],
    labels: {
      "evcp.managed": "true",
      "evcp.kind": "workspace-warm",
      "evcp.warm-slot-id": "slot-1"
    }
  });
  await fixture.pool.reconcile();
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal((await fixture.store.list()).length, 0);
});

test("ensureCapacity retries quarantined cleanup after its backoff", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, cleanupFailure: "schema" });
  await fixture.pool.ensureCapacity();
  fixture.previewExitCode = 1;
  await fixture.createPool().reconcile();
  const [failed] = await fixture.store.list();
  assert.equal(failed.state, "failed");
  assert.equal(failed.lastError, "cleanup_error");
  assert.equal(failed.resourceKey, "warm-resource-1");
  fixture.setNow(new Date(failed.retryAfter));
  fixture.previewExitCode = 0;
  await fixture.pool.ensureCapacity();
  const [replacement] = await fixture.store.list();
  assert.equal(replacement.state, "ready");
  assert.equal(replacement.resourceKey, "warm-resource-2");
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
});

test("reconcile preserves a durable healthy ready slot and checks its health", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  fixture.docker.state.execCalls.length = 0;
  await fixture.createPool().reconcile();
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal((await fixture.store.list())[0].state, "ready");
  assert.equal(fixture.docker.state.execCalls.length, 1);
});

test("reconcile cleans an abandoned claim and does not refill until explicitly requested", async () => {
  const runtime = createRuntimeLeaseFixture();
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: runtime.createStore()
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  runtime.deleteProject("project-1");
  await fixture.createPool().reconcile();
  assert.equal((await fixture.store.list()).length, 0);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
  assert.deepEqual(fixture.revokedKeys, ["key-1"]);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.equal(fixture.docker.state.volumes.length, 0);
  assert.equal(fixture.prepareAttempts, 1);
});

test("reconcile retires a claim owned by a durable runtime without physical cleanup", async () => {
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: {
      provisioningLeases: availableProjectLeases,
      async list() {
        return [{ record: { projectId: "project-1", resourceKey: "warm-resource-1" } }];
      }
    }
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  await fixture.createPool().reconcile();
  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
});

const availableProjectLeases = {
  async acquire() {
    return "acquired";
  },
  async renew() {
    return true;
  },
  async release() {}
};
