import assert from "node:assert/strict";
import test from "node:test";
import { createCrashedWarmStartupFixture, deferred } from "./workspace-warm-startup-fixture.mjs";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { startWorkspaceSweeps } from "../../apps/platform-api/src/workspace-orchestrator/workspace-sweeps.ts";

async function assertAllocationSurvives(fixture) {
  assert.ok(await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"));
  assert.equal(
    (await fixture.docker.listManagedVolumes()).some(
      ({ name }) => name === "evcp-ws-warm-resource-1-data"
    ),
    true
  );
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
}

test("runtime startup recovers a completed warm handoff before reconcile or orphan cleanup", async () => {
  const fixture = await createCrashedWarmStartupFixture({ projectId: "prj_alpha" });
  const replica = fixture.createReplica();
  await replica.boot();

  const [snapshot] = await fixture.runtimeRecords.list();
  assert.equal(snapshot?.record.resourceKey, "warm-resource-1");
  assert.equal(snapshot.record.containerId, fixture.containerId);
  assert.equal(snapshot.llmGatewayKeyId, "key-1");
  assert.equal(replica.orchestrator.getWorkspace("prj_alpha").state, "running");
  assert.equal(
    (await replica.orchestrator.resolveEnv("prj_alpha")).LLM_GATEWAY_KEY,
    "llm-secret-1"
  );
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
    false
  );
  await assertAllocationSurvives(fixture);
  const reloadedSecrets = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: fixture.secretSql.persistence
  });
  await reloadedSecrets.hydrate();
  assert.deepEqual(await reloadedSecrets.resolveEnv("prj_alpha"), fixture.allocation.env);
});

for (const timing of [
  "before-recovery",
  "during-health",
  "container-only",
  "container-owner-during-failed-health"
]) {
  test(`recovery cannot import another project's physical allocation (${timing})`, async () => {
    const fixture = await createCrashedWarmStartupFixture({ projectId: "prj_alpha" });
    const owner = {
      record: {
        id: "ws-prj-beta",
        projectId: "prj_beta",
        slug: "beta",
        resourceKey: timing.startsWith("container") ? "warm-resource-other" : "warm-resource-1",
        state: "running",
        containerId: fixture.containerId,
        cpuCores: 1,
        memoryMb: 2048,
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
        lastActivityAt: "2026-09-05T00:00:00.000Z"
      },
      llmGatewayKeyId: "key-1"
    };
    const persistOwner = async () => {
      for (const [name, value] of Object.entries(fixture.allocation.env)) {
        await fixture.deps.secrets.put("prj_beta", name, value);
      }
      await fixture.runtimeRecords.save(owner);
    };
    if (timing === "during-health" || timing === "container-owner-during-failed-health") {
      const exec = fixture.docker.execInContainer.bind(fixture.docker);
      let persisted = false;
      fixture.docker.execInContainer = async (...args) => {
        if (!persisted && args[0] === fixture.containerId) {
          persisted = true;
          await persistOwner();
        }
        if (timing === "container-owner-during-failed-health" && args[0] === fixture.containerId)
          return { stdout: "", stderr: "unhealthy", exitCode: 1 };
        return exec(...args);
      };
    } else await persistOwner();

    const replica = fixture.createReplica();
    await replica.boot();
    const snapshots = await fixture.runtimeRecords.list();
    assert.deepEqual(
      snapshots.map(({ record }) => record.projectId),
      ["prj_beta"]
    );
    assert.deepEqual(snapshots, [owner]);
    assert.deepEqual(await fixture.deps.secrets.listNames("prj_alpha"), []);
    assert.equal(replica.orchestrator.getWorkspace("prj_alpha"), null);
    const ownerEnv = await fixture.deps.secrets.resolveEnv("prj_beta");
    assert.equal(
      Object.entries(fixture.allocation.env).every(([name, value]) => ownerEnv[name] === value),
      true
    );
    assert.equal(
      (await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))?.containerId,
      fixture.containerId
    );
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1")).running, true);
    assert.equal(
      (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
      true
    );
    await assertAllocationSurvives(fixture);
    if (timing === "container-owner-during-failed-health") {
      const quarantined = (await fixture.store.list()).find(
        ({ id }) => id === fixture.allocation.slotId
      );
      assert.equal(quarantined.state, "failed");
      fixture.setNow(new Date(quarantined.retryAfter));
      await replica.pool.ensureCapacity();
      assert.equal(
        (await fixture.store.list()).find(({ id }) => id === fixture.allocation.slotId)
          ?.resourceKey,
        "warm-resource-1"
      );
      assert.deepEqual(await fixture.runtimeRecords.list(), [owner]);
      assert.deepEqual(await fixture.deps.secrets.listNames("prj_alpha"), []);
      await assertAllocationSurvives(fixture);
    }
  });
}

for (const failure of [
  "missing",
  "unhealthy",
  "mismatched",
  "wrong-preview-base",
  "missing-project"
]) {
  test(`startup leaves ${failure} handoffs to fenced cleanup`, async () => {
    const fixture = await createCrashedWarmStartupFixture({
      envOverrides:
        failure === "mismatched"
          ? { LLM_GATEWAY_KEY: "unrelated-key" }
          : failure === "wrong-preview-base"
            ? { EVCP_PREVIEW_BASE: "/preview/prj-crash" }
            : {}
    });
    if (failure === "missing") await fixture.docker.removeContainer(fixture.containerId);
    if (failure === "missing-project") fixture.persistence.deleteProject("prj_crash");
    if (failure === "unhealthy") {
      const execute = fixture.docker.execInContainer.bind(fixture.docker);
      fixture.docker.execInContainer = async (containerId, command) =>
        containerId === fixture.containerId
          ? { stdout: "", stderr: "unhealthy", exitCode: 1 }
          : execute(containerId, command);
    }
    await fixture.createReplica().boot();
    assert.deepEqual(await fixture.runtimeRecords.list(), []);
    assert.deepEqual(await fixture.deps.secrets.resolveEnv("prj_crash"), {});
    assert.equal(await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"), null);
    assert.equal(
      (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
      false
    );
    assert.deepEqual(fixture.releasedSchemas, ["warm-resource-1"]);
    assert.deepEqual(fixture.releasedBuckets, ["warm-resource-1"]);
    assert.deepEqual(fixture.revokedKeys, ["key-1"]);
  });
}

for (const failure of ["secrets", "runtime"]) {
  test(`startup stops before cleanup when ${failure} persistence fails, then recovers on retry`, async () => {
    const fixture = await createCrashedWarmStartupFixture();
    let fail = true;
    if (failure === "secrets") {
      fixture.secretSql.beforeQuery = async (statement) => {
        if (fail && statement.includes("INSERT INTO project_secrets"))
          throw new Error("secret storage unavailable");
      };
    } else {
      const upsert = fixture.persistence.client.workspaceRuntimeRecord.upsert;
      fixture.persistence.client.workspaceRuntimeRecord.upsert = async (...args) => {
        if (fail) throw new Error("runtime storage unavailable");
        return upsert(...args);
      };
    }
    await assert.rejects(fixture.createReplica().boot(), /storage unavailable/);
    assert.deepEqual(await fixture.runtimeRecords.list(), []);
    assert.equal((await fixture.store.list())[0].state, "claiming");
    await assertAllocationSurvives(fixture);
    fail = false;
    await fixture.createReplica().boot();
    assert.equal((await fixture.runtimeRecords.list())[0].record.resourceKey, "warm-resource-1");
    await assertAllocationSurvives(fixture);
  });
}

test("an expired recovery worker cannot overwrite the successor's durable identity or secrets", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const entered = deferred();
  const release = deferred();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  let paused = false;
  fixture.docker.execInContainer = async (containerId, command) => {
    if (containerId === fixture.containerId && !paused) {
      paused = true;
      entered.resolve();
      await release.promise;
    }
    return execute(containerId, command);
  };
  const first = fixture.createReplica();
  const stale = assert.rejects(first.boot(), /lease is no longer owned/);
  await entered.promise;
  try {
    fixture.persistence.advance(1_001);
    await fixture.createReplica().boot();
    const expected = await fixture.runtimeRecords.list();
    await fixture.deps.secrets.rotate("prj_crash", "LLM_GATEWAY_KEY", "successor-rotated-secret");
    release.resolve();
    await stale;
    assert.deepEqual(await fixture.runtimeRecords.list(), expected);
    assert.equal(
      (await fixture.deps.secrets.resolveEnv("prj_crash")).LLM_GATEWAY_KEY,
      "successor-rotated-secret"
    );
    assert.equal(first.orchestrator.getWorkspace("prj_crash"), null);
    await assertAllocationSurvives(fixture);
  } finally {
    release.resolve();
  }
});

test("the periodic startup sweep recovers a claim once a contended project lease expires", async (t) => {
  const fixture = await createCrashedWarmStartupFixture();
  await fixture.runtimeRecords.provisioningLeases.acquire("prj_crash", "still-live-owner", 1_000);
  const replica = fixture.createReplica();
  await replica.boot();
  assert.deepEqual(await fixture.runtimeRecords.list(), []);
  await assertAllocationSurvives(fixture);
  fixture.persistence.advance(1_001);
  t.mock.timers.enable({ apis: ["setInterval"] });
  const sweeps = startWorkspaceSweeps({ workspaceOrchestrator: replica.orchestrator });
  t.after(() => sweeps.forEach((sweep) => sweep.stop()));
  t.mock.timers.tick(60_000);
  await new Promise(setImmediate);
  await replica.pool.waitForIdle();
  assert.equal((await fixture.runtimeRecords.list())[0]?.record.resourceKey, "warm-resource-1");
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.allocation.slotId),
    false
  );
  await assertAllocationSurvives(fixture);
});

test("a replica skips a live recovery lease without orphaning its final container", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const entered = deferred();
  const release = deferred();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  let paused = false;
  fixture.docker.execInContainer = async (containerId, command) => {
    if (containerId === fixture.containerId && !paused) {
      paused = true;
      entered.resolve();
      await release.promise;
    }
    return execute(containerId, command);
  };
  const first = fixture.createReplica();
  const second = fixture.createReplica();
  const recovery = first.boot();
  await entered.promise;
  try {
    await second.boot();
    assert.equal((await fixture.runtimeRecords.list()).length, 0);
    await assertAllocationSurvives(fixture);
  } finally {
    release.resolve();
    await recovery;
  }
  assert.equal((await fixture.runtimeRecords.list())[0].record.resourceKey, "warm-resource-1");
  await assertAllocationSurvives(fixture);
});

test("orphan inventory protects a claim that becomes durable after its runtime read", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const entered = deferred();
  const release = deferred();
  const execute = fixture.docker.execInContainer.bind(fixture.docker);
  let paused = false;
  fixture.docker.execInContainer = async (containerId, command) => {
    if (containerId === fixture.containerId && !paused) {
      paused = true;
      entered.resolve();
      await release.promise;
    }
    return execute(containerId, command);
  };
  const first = fixture.createReplica();
  const recovery = first.boot();
  await entered.promise;
  const findMany = fixture.persistence.client.workspaceRuntimeRecord.findMany;
  let reads = 0;
  fixture.persistence.client.workspaceRuntimeRecord.findMany = async (...args) => {
    const records = await findMany(...args);
    // Second startup: hydrate, reconciliation inventory, then orphan inventory.
    if (++reads === 3) {
      release.resolve();
      await recovery;
    }
    return records;
  };
  try {
    await fixture.createReplica().boot();
    assert.ok(reads >= 3);
    await assertAllocationSurvives(fixture);
  } finally {
    release.resolve();
    await recovery;
  }
});
