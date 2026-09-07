import test from "node:test";
import assert from "node:assert/strict";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { workspaceWarmResourceLabels } from "../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts";

async function staleFixture(options = {}) {
  const fixture = createWarmPoolFixture({ targetSize: 1, ...options });
  fixture.deps.image = "repo/evcp-workspace-next:v1";
  await fixture.pool.ensureCapacity();
  fixture.deps.image = "repo/evcp-workspace-next:v2";
  return fixture;
}

test("stale ready image is fenced before destruction and replaced with the configured release", async () => {
  const fixture = await staleFixture();
  const [old] = await fixture.store.list();
  const remove = fixture.docker.removeContainer;
  fixture.docker.removeContainer = async (id) => {
    assert.equal((await fixture.store.list())[0].state, "cleaning");
    assert.equal(await fixture.pool.claim("racing-project"), null);
    return remove(id);
  };
  await fixture.pool.reconcile();
  assert.deepEqual(await fixture.store.list(), []);
  assert.equal(fixture.docker.state.containers.length, 0);
  assert.deepEqual(fixture.releasedSchemas, [old.resourceKey]);
  assert.deepEqual(fixture.releasedBuckets, [old.resourceKey]);
  assert.deepEqual(fixture.revokedKeys, [old.llmGatewayKeyId]);
  await fixture.pool.ensureCapacity();
  assert.notEqual((await fixture.store.list())[0].resourceKey, old.resourceKey);
  assert.equal(fixture.docker.state.containers[0].spec.image, "repo/evcp-workspace-next:v2");
});

test("stale status contains only aggregate counts and clears after retirement", async () => {
  const fixture = await staleFixture();
  assert.deepEqual(await fixture.pool.getStatus(), {
    target: 1,
    ready: 1,
    preparing: 0,
    claiming: 0,
    failed: 0,
    staleImage: 1
  });
  await fixture.pool.reconcile();
  assert.equal((await fixture.pool.getStatus()).staleImage, 0);
  const audit = fixture.audits.find(({ action }) => action === "workspace.pool_reconciled");
  assert.equal(audit.metadata.staleImage, 1);
  assert.doesNotMatch(JSON.stringify(audit), /warm-resource|warm_slot|postgres|secret|repo\//);
});

test("stale ready allocation already owned by a runtime remains untouched", async () => {
  const fixture = await staleFixture();
  const before = await fixture.store.list();
  fixture.deps.runtimeRecords = {
    async list() {
      return [{ record: { projectId: "project-1", resourceKey: before[0].resourceKey } }];
    }
  };
  await fixture.pool.reconcile();
  assert.deepEqual(await fixture.store.list(), before);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("stale claiming allocation under a live project lease remains untouched", async () => {
  const runtime = createRuntimeLeaseFixture();
  const records = runtime.createStore();
  const fixture = await staleFixture({ runtimeRecords: records });
  await records.provisioningLeases.acquire("project-1", "owner", 300_000);
  await fixture.pool.claim("project-1");
  const before = await fixture.store.list();
  await fixture.pool.reconcile();
  assert.deepEqual(await fixture.store.list(), before);
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("claim winning before stale cleanup acquisition keeps all allocation resources", async () => {
  const fixture = await staleFixture();
  const acquire = fixture.store.acquireCleanup.bind(fixture.store);
  fixture.store.acquireCleanup = async (...args) => {
    assert.ok(await fixture.pool.claim("project-1"));
    return acquire(...args);
  };
  await fixture.pool.reconcile();
  assert.equal((await fixture.store.list())[0].state, "claiming");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("failed stale container deletion quarantines its allocation until cleanup retry", async () => {
  const fixture = await staleFixture();
  fixture.docker.removeContainer = async () => {
    throw new Error("private Docker details");
  };
  await fixture.pool.reconcile();
  const [slot] = await fixture.store.list();
  assert.equal(slot.state, "failed");
  assert.equal(slot.lastError, "cleanup_error");
  await fixture.pool.ensureCapacity();
  assert.equal(fixture.prepareAttempts, 1);
  assert.equal(fixture.docker.state.volumes.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.revokedKeys, []);
});

test("a late stale preparation with the same slot label cannot retire its matching-image successor", async () => {
  const fixture = await staleFixture();
  fixture.docker.state.containers[0].spec.image = fixture.deps.image;
  const [before] = await fixture.store.list();
  await fixture.docker.createContainer({
    name: "evcp-ws-retired-generation",
    image: "repo/evcp-workspace-next:v1",
    env: [],
    labels: workspaceWarmResourceLabels(before.id)
  });
  fixture.docker.state.containers.reverse();
  await fixture.pool.reconcile();
  assert.equal((await fixture.store.list())[0]?.state, "ready");
  assert.ok(await fixture.docker.inspectContainer(`evcp-ws-${before.resourceKey}`));
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("recoverable preparing slots inspect their image under expired ownership before cleanup", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  fixture.deps.image = "repo/evcp-workspace-next:v2";
  await fixture.store.createPreparing(
    { id: "abandoned", resourceKey: "warm-abandoned" },
    {
      ownerId: "expired",
      now: "2026-09-04T23:00:00.000Z",
      expiresAt: "2026-09-04T23:01:00.000Z"
    }
  );
  await fixture.docker.createContainer({
    name: "evcp-ws-warm-abandoned",
    image: "repo/evcp-workspace-next:v1",
    env: [],
    labels: workspaceWarmResourceLabels("abandoned")
  });
  assert.equal((await fixture.pool.getStatus()).staleImage, 1);
  await fixture.pool.reconcile();
  assert.deepEqual(await fixture.store.list(), []);
  assert.equal(fixture.docker.state.containers.length, 0);
  await fixture.pool.ensureCapacity();
  assert.equal(fixture.docker.state.containers[0].spec.image, "repo/evcp-workspace-next:v2");
});

test("stale preparing slot with a live operation owner cannot be drained", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 1 });
  const exec = fixture.docker.execInContainer;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  fixture.docker.execInContainer = async (...args) => {
    await gate;
    return exec(...args);
  };
  fixture.deps.image = "repo/evcp-workspace-next:v1";
  const preparing = fixture.pool.ensureCapacity();
  await new Promise(setImmediate);
  fixture.deps.image = "repo/evcp-workspace-next:v2";
  await fixture.createPool().reconcile();
  assert.equal((await fixture.store.list())[0].state, "preparing");
  assert.equal(fixture.docker.state.containers.length, 1);
  assert.deepEqual(fixture.releasedSchemas, []);
  release();
  await preparing;
});
