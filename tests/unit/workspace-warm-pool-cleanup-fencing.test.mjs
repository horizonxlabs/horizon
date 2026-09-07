import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

test("an expired partial cleanup stays nonclaimable and is resumed by another cleaner", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1, operationLeaseMs: 30 });
  await fixture.pool.ensureCapacity();
  fixture.previewExitCode = 1;
  const removeContainer = fixture.docker.removeContainer;
  fixture.docker.removeContainer = async (containerId) => {
    await removeContainer(containerId);
    fixture.setNow(new Date("2026-09-05T00:00:00.031Z"));
  };

  await fixture.createPool().reconcile();

  const [cleaning] = await fixture.store.list();
  assert.equal(cleaning.state, "cleaning");
  assert.equal(await fixture.pool.claim("project-after-crash"), null);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.deepEqual(fixture.releasedSchemas, []);

  fixture.docker.removeContainer = removeContainer;
  await fixture.createPool().reconcile();

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
  assert.deepEqual(fixture.revokedKeys, ["key-1"]);
});

test("a project lease acquired at the cleanup boundary prevents claimed resource deletion", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: runtimeStore,
    createOperationOwner: () => "cleanup-owner"
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  const leases = runtimeStore.provisioningLeases;
  const acquire = leases.acquire.bind(leases);
  let projectLeaseOutcome = "contended";
  leases.acquire = async (projectId, token, ttlMs) => {
    if (token === "cleanup-owner") {
      projectLeaseOutcome = await acquire(projectId, "project-owner", ttlMs);
    }
    return acquire(projectId, token, ttlMs);
  };

  await fixture.createPool().reconcile();

  assert.equal(projectLeaseOutcome, "acquired");
  assert.equal((await fixture.store.list())[0].state, "claiming");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("a claiming cleanup lease excludes project provisioning at the slot-cleanup boundary", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: runtimeStore,
    createOperationOwner: () => "cleanup-owner"
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  fixture.previewExitCode = 1;
  const acquireCleanup = fixture.store.acquireCleanup.bind(fixture.store);
  let projectLeaseOutcome;
  fixture.store.acquireCleanup = async (...args) => {
    projectLeaseOutcome = await runtimeStore.provisioningLeases.acquire(
      "project-1",
      "project-owner",
      300_000
    );
    return acquireCleanup(...args);
  };

  await fixture.createPool().reconcile();

  assert.equal(projectLeaseOutcome, "contended");
  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
  assert.equal(fixture.docker.state.containers.length, 0);
});

test("claiming cleanup renews its project lease throughout destructive work", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({
    targetSize: 1,
    runtimeRecords: runtimeStore,
    operationLeaseMs: 30,
    createOperationOwner: () => "cleanup-owner"
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("project-1");
  fixture.previewExitCode = 1;
  const removeContainer = fixture.docker.removeContainer;
  let cleanupStarted;
  let releaseCleanup;
  const cleanupGate = new Promise((resolve) => {
    releaseCleanup = resolve;
  });
  const started = new Promise((resolve) => {
    cleanupStarted = resolve;
  });
  fixture.docker.removeContainer = async (containerId) => {
    cleanupStarted();
    await cleanupGate;
    return removeContainer(containerId);
  };

  const reconciling = fixture.createPool().reconcile();
  await started;
  runtime.advance(20);
  t.mock.timers.tick(10);
  await new Promise(setImmediate);
  runtime.advance(11);

  assert.equal(
    await runtimeStore.provisioningLeases.acquire("project-1", "project-owner", 30),
    "contended"
  );
  releaseCleanup();
  await reconciling;
  assert.deepEqual(await fixture.store.list(), []);
});

test("a deleted project's stale claim cannot abort other cleanup or refill", async () => {
  const runtime = createRuntimeLeaseFixture();
  const runtimeStore = runtime.createStore();
  const fixture = createWarmPoolFixture({
    targetSize: 2,
    runtimeRecords: runtimeStore
  });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("deleted-project");
  runtime.deleteProject("deleted-project");
  fixture.previewExitCode = 1;

  await fixture.createPool().reconcile();

  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(fixture.releasedSchemas.sort(), ["warm-resource-1", "warm-resource-2"]);
  fixture.previewExitCode = 0;
  await fixture.pool.ensureCapacity();
  assert.deepEqual(
    (await fixture.store.list()).map((slot) => slot.state),
    ["ready", "ready"]
  );
  assert.equal(fixture.prepareAttempts, 4);
});

test("a claimed slot is preserved when project absence cannot be established durably", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  await fixture.pool.ensureCapacity();
  await fixture.pool.claim("unknown-project");

  await fixture.createPool().reconcile();

  assert.equal((await fixture.store.list())[0].state, "claiming");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});
