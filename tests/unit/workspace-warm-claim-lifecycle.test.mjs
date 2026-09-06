import assert from "node:assert/strict";
import test from "node:test";
import { createCrashedWarmStartupFixture } from "./workspace-warm-startup-fixture.mjs";

test("expiry after a contended startup recovery cannot turn a healthy handoff into cleanup", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  await fixture.runtimeRecords.provisioningLeases.acquire("prj_crash", "live-owner", 1_000);
  const execute = fixture.persistence.client.$executeRawUnsafe;
  let expired = false;
  fixture.persistence.client.$executeRawUnsafe = async (...args) => {
    const result = await execute(...args);
    if (!expired && args[0].trimStart().startsWith("INSERT INTO") && result === 0) {
      expired = true;
      fixture.persistence.advance(1_001);
    }
    return result;
  };
  await fixture.createReplica().boot();
  assert.equal(expired, true);
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")) !== null, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
  await fixture.createReplica().boot();
  assert.equal((await fixture.runtimeRecords.list())[0].record.resourceKey, "warm-resource-1");
});

test("periodic claim cleanup removes an unhealthy final container before releasing its mounted volume", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  fixture.docker.execInContainer = async (containerId, command) =>
    containerId === fixture.containerId
      ? { stdout: "", stderr: "unhealthy", exitCode: 1 }
      : execute(containerId, command);
  const removeVolume = fixture.docker.removeVolume;
  fixture.docker.removeVolume = async (name) => {
    if (
      name === "evcp-ws-warm-resource-1-data" &&
      (await fixture.docker.inspectContainer("evcp-ws-prj-crash"))
    ) {
      throw new Error("volume is in use by the final project container");
    }
    return removeVolume(name);
  };
  await fixture.createReplica().pool.reconcile();
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")) === null, true);
  assert.equal(
    (await fixture.docker.listManagedVolumes()).some(
      ({ name }) => name === "evcp-ws-warm-resource-1-data"
    ),
    false
  );
  assert.deepEqual(await fixture.store.list(), []);
  assert.deepEqual(await fixture.runtimeRecords.list(), []);
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
});

test("failed final-container removal stays durable and its retry cannot bypass a live project owner", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  fixture.docker.execInContainer = async (containerId, command) =>
    containerId === fixture.containerId
      ? { stdout: "", stderr: "unhealthy", exitCode: 1 }
      : execute(containerId, command);
  const remove = fixture.docker.removeContainer;
  let fail = true;
  fixture.docker.removeContainer = async (containerId) => {
    if (containerId === fixture.containerId && fail) throw new Error("Docker removal unavailable");
    return remove(containerId);
  };
  await fixture.createReplica().pool.reconcile();
  const [failed] = await fixture.store.list();
  assert.equal(failed.state, "failed");
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
  fail = false;
  fixture.setNow(new Date(failed.retryAfter));
  await fixture.runtimeRecords.provisioningLeases.acquire("prj_crash", "live-owner", 10_000);
  await fixture.createReplica().pool.ensureCapacity();
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")) !== null, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  fixture.persistence.advance(10_001);
  await fixture.createReplica().pool.ensureCapacity();
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")) === null, true);
  assert.equal((await fixture.store.list())[0].state, "ready");
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
});

test("retiring a redundant warm claim preserves Docker-hydrated idle state and preview wake", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  for (const [name, value] of Object.entries(fixture.allocation.env)) {
    await fixture.deps.secrets.put("prj_crash", name, value);
  }
  await fixture.runtimeRecords.save({
    record: {
      id: "ws-prj-crash",
      projectId: "prj_crash",
      slug: "current-business-slug",
      resourceKey: "warm-resource-1",
      state: "running",
      containerId: fixture.containerId,
      cpuCores: 1,
      memoryMb: 2048,
      lastActivityAt: "2026-09-05T00:00:00.000Z",
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z"
    },
    llmGatewayKeyId: "key-1"
  });
  await fixture.docker.stopContainer(fixture.containerId);
  const replica = fixture.createReplica();
  await replica.boot();
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").state, "idle");
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").slug, "current-business-slug");
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
    false
  );
  await replica.orchestrator.wakeWorkspace("prj_crash");
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash")).running, true);
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").state, "running");
  assert.deepEqual(fixture.releasedSchemas, []);
});
