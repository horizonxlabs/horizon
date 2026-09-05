import test from "node:test";
import assert from "node:assert/strict";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
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

test("reconciliation waits for in-process preparation before deciding a slot is stale", async () => {
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
  const reconciling = fixture.pool.reconcile();
  await new Promise(setImmediate);
  releaseHealth();
  await Promise.all([preparing, reconciling]);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.equal((await fixture.store.list())[0].state, "ready");
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

test("orphan cleanup preserves warm-labeled volumes transferred to durable runtimes", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  const removed = await cleanupOrphanWorkspaceResources({
    docker: fixture.docker,
    activeProjectIds: new Set(["project-1"]),
    activeWarmSlotIds: new Set(),
    activeResourceKeys: new Set(["warm-resource-1"])
  });
  assert.equal(removed.includes("evcp-ws-warm-resource-1-data"), false);
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
    activeWarmSlotIds: new Set(["warm_slot_1"])
  });
  assert.deepEqual(removed, ["evcp-ws-warm-orphan", "evcp-ws-warm-orphan-data"]);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
});

test("reconcile emits one aggregate audit with no slot identifiers or credentials", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
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

test("reconcile quarantines cleanup failures and retries them on the next pass", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, cleanupFailure: "schema" });
  await fixture.pool.ensureCapacity();
  fixture.previewExitCode = 1;
  await fixture.createPool().reconcile();
  const [failed] = await fixture.store.list();
  assert.equal(failed.state, "failed");
  assert.equal(failed.lastError, "cleanup_error");
  assert.equal(failed.resourceKey, "warm-resource-1");
  await fixture.createPool().reconcile();
  assert.equal((await fixture.store.list()).length, 0);
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
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
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
