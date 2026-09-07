import assert from "node:assert/strict";
import test from "node:test";
import { createCrashedWarmStartupFixture } from "./workspace-warm-startup-fixture.mjs";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";
import { buildWarmContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

test("hot runtime ownership is persisted before slot retirement and published only after completion", async () => {
  const fixture = await createFixture();
  const complete = fixture.deps.warmPool.completeClaim;
  fixture.deps.warmPool.completeClaim = async (...args) => {
    const snapshot = fixture.snapshots.get("prj_transfer");
    assert.equal(snapshot.record.containerId, fixture.slot.containerId);
    assert.equal(snapshot.record.resourceKey, fixture.slot.resourceKey);
    assert.equal(snapshot.llmGatewayKeyId, "key-1");
    assert.equal(Object.keys(await fixture.deps.secrets.resolveEnv("prj_transfer")).length, 6);
    assert.equal((await fixture.prepared.store.list())[0].state, "claiming");
    assert.equal(fixture.orchestrator.getWorkspace("prj_transfer"), null);
    assert.equal(
      (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running,
      true
    );
    return complete(...args);
  };
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_transfer",
    slug: "transfer"
  });
  assert.equal(fixture.orchestrator.getWorkspace("prj_transfer"), record);
});

test("a runtime write with a lost response rolls back persistence before pool-owned destruction", async () => {
  const fixture = await createFixture();
  const save = fixture.deps.runtimeRecords.save;
  let failed = false;
  fixture.deps.runtimeRecords.save = async (snapshot) => {
    await save(snapshot);
    if (!failed) {
      failed = true;
      throw new Error("runtime response unavailable");
    }
  };
  const fail = fixture.deps.warmPool.failClaim;
  fixture.deps.warmPool.failClaim = async (...args) => {
    assert.equal(fixture.snapshots.has("prj_rollback"), false);
    assert.equal(Object.keys(await fixture.deps.secrets.resolveEnv("prj_rollback")).length, 0);
    assert.equal(
      (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running,
      true
    );
    assert.equal(
      fixture.order.some((step) => step.startsWith("remove:")),
      false
    );
    return fail(...args);
  };
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_rollback",
    slug: "rollback"
  });
  assert.equal(record.resourceKey, "prj-rollback");
  assert.equal(
    fixture.order.filter((step) => step === `remove:${fixture.slot.containerId}`).length,
    1
  );
});

for (const boundary of ["secrets", "runtime"]) {
  test(`failed ${boundary} rollback preserves durable ownership and the hot allocation for reconciliation`, async () => {
    const fixture = await createFixture({ failure: "complete" });
    if (boundary === "secrets") {
      fixture.deps.secrets.removeProvisioning = async () => {
        throw new Error("rollback unavailable");
      };
    } else {
      fixture.deps.runtimeRecords.remove = async () => {
        throw new Error("rollback unavailable");
      };
    }
    await assert.rejects(
      fixture.orchestrator.provisionWorkspace({ projectId: "prj_rollback", slug: "rollback" }),
      /rollback/
    );
    assert.equal(
      fixture.snapshots.get("prj_rollback").record.containerId,
      fixture.slot.containerId
    );
    assert.equal((await fixture.prepared.store.list())[0].state, "claiming");
    assert.equal(
      (await fixture.deps.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running,
      true
    );
    assert.equal(fixture.order.includes("fail"), false);
    assert.deepEqual(fixture.coldCalls, []);
    assert.deepEqual(fixture.prepared.releasedSchemas, []);
  });
}

test("a lost slot-retirement response preserves the runtime that already owns the hot container", async () => {
  const fixture = await createFixture();
  const remove = fixture.prepared.store.remove;
  fixture.prepared.store.remove = async (...args) => {
    await remove(...args);
    throw new Error("retirement response unavailable");
  };
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_retired",
    slug: "retired"
  });
  assert.equal(record.containerId, fixture.slot.containerId);
  assert.equal(fixture.snapshots.get("prj_retired").record.resourceKey, "warm-resource-1");
  assert.deepEqual(await fixture.prepared.store.list(), []);
  assert.equal(fixture.order.includes("remove-secrets"), false);
  assert.deepEqual(fixture.coldCalls, []);
});

test("an unknown retirement outcome retains runtime ownership for reconciliation", async () => {
  const fixture = await createFixture();
  const remove = fixture.prepared.store.remove;
  const list = fixture.prepared.store.list;
  let unreadable = false;
  fixture.prepared.store.remove = async (...args) => {
    await remove(...args);
    unreadable = true;
    throw new Error("retirement response unavailable");
  };
  fixture.prepared.store.list = async () => {
    if (unreadable) {
      unreadable = false;
      throw new Error("retirement lookup unavailable");
    }
    return list();
  };
  await assert.rejects(
    fixture.orchestrator.provisionWorkspace({ projectId: "prj_uncertain", slug: "uncertain" })
  );
  assert.equal(
    fixture.snapshots.get("prj_uncertain")?.record.containerId,
    fixture.slot.containerId
  );
  assert.equal(Object.keys(await fixture.deps.secrets.resolveEnv("prj_uncertain")).length, 6);
  assert.equal(fixture.order.includes("remove-secrets"), false);
  assert.deepEqual(fixture.coldCalls, []);
});

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
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) !== null, true);
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
      (await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))
    ) {
      throw new Error("volume is in use by the final project container");
    }
    return removeVolume(name);
  };
  await fixture.createReplica().pool.reconcile();
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) === null, true);
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
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) !== null, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  fixture.persistence.advance(10_001);
  await fixture.createReplica().pool.ensureCapacity();
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")) === null, true);
  assert.equal((await fixture.store.list())[0].state, "ready");
  assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
});

test("retiring a redundant warm claim preserves Docker-hydrated idle state and preview wake", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  // This handoff keeps the prepared physical name, including when its runtime later goes idle.
  await fixture.docker.removeContainer(fixture.containerId);
  const { containerId } = await fixture.docker.createContainer(
    buildWarmContainerSpec({
      slotId: fixture.allocation.slotId,
      resourceKey: fixture.allocation.resourceKey,
      image: "evcp/workspace-next:1",
      env: { ...fixture.allocation.env, EVCP_PREVIEW_BASE: "/preview/warm-resource-1" },
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-warm-resource-1-data"
    })
  );
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
      containerId,
      cpuCores: 1,
      memoryMb: 2048,
      lastActivityAt: "2026-09-05T00:00:00.000Z",
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z"
    },
    llmGatewayKeyId: "key-1"
  });
  await fixture.docker.stopContainer(containerId);
  const replica = fixture.createReplica();
  await replica.boot();
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").state, "idle");
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").slug, "current-business-slug");
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
    false
  );
  await replica.orchestrator.wakeWorkspace("prj_crash");
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")).running, true);
  assert.equal(replica.orchestrator.getWorkspace("prj_crash").state, "running");
  assert.deepEqual(fixture.releasedSchemas, []);
});
