import assert from "node:assert/strict";
import test from "node:test";
import { createRetainedRuntimeFixture } from "./workspace-warm-owned-repair-fixture.mjs";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts";

async function assertRetained(fixture) {
  assert.equal(
    (await fixture.store.list()).some(
      ({ id, secretPayload }) => id === fixture.slot.id && !!secretPayload
    ),
    true
  );
  assert.equal(
    (await fixture.runtimeRecords.list())[0].record.containerId,
    fixture.slot.containerId
  );
  assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
}

test("foreground recovery repairs an incomplete durable owner before exposing its environment", async () => {
  const fixture = await createRetainedRuntimeFixture();
  const foreground = createWorkspaceOrchestrator({ ...fixture.deps, warmPool: fixture.pool });
  await foreground.provisionWorkspace({ projectId: "prj_rollback", slug: "retry" });
  const env = await foreground.resolveEnv("prj_rollback");
  assert.equal(
    Object.entries(fixture.expectedEnv).every(([name, value]) => env[name] === value),
    true
  );
  assert.equal(foreground.getWorkspace("prj_rollback").containerId, fixture.slot.containerId);
});

test("cleanup retries repair retained runtime secrets before discarding encrypted preparation", async () => {
  const fixture = await createRetainedRuntimeFixture();
  await fixture.pool.failClaim(fixture.slot.id, new Error("retry cleanup"), async () => {});
  const quarantined = (await fixture.store.list()).find(({ id }) => id === fixture.slot.id);
  assert.equal(quarantined.state, "failed");
  fixture.setNow(new Date(quarantined.retryAfter));
  await fixture.pool.ensureCapacity();
  const env = await fixture.deps.secrets.resolveEnv("prj_rollback");
  assert.equal(
    Object.entries(fixture.expectedEnv).every(([name, value]) => env[name] === value),
    true
  );
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
    false
  );
  assert.deepEqual(fixture.releasedSchemas, []);
});

test("secret repair cannot write after lease takeover between its precheck and SQL transaction", async () => {
  const fixture = await createRetainedRuntimeFixture();
  const repair = fixture.secretSql.persistence.repairProvisioning;
  fixture.secretSql.persistence.repairProvisioning = async (...args) => {
    fixture.persistence.advance(1_001);
    await fixture.runtimeRecords.provisioningLeases.acquire("prj_rollback", "successor", 1_000);
    await fixture.deps.secrets.rotate("prj_rollback", "LLM_GATEWAY_KEY", "successor-value");
    return repair(...args);
  };
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  assert.equal(
    (await fixture.deps.secrets.resolveEnv("prj_rollback")).LLM_GATEWAY_KEY === "successor-value",
    true
  );
  assert.equal(fixture.secretSql.rows.size, 1);
  await assertRetained(fixture);
});

test("failed runtime rollback repairs retained secrets before retiring its claim and recreating for publication", async () => {
  const fixture = await createRetainedRuntimeFixture();
  const replica = fixture.createReplica();
  await replica.boot();
  const env = await replica.orchestrator.resolveEnv("prj_rollback");
  assert.equal(
    Object.entries(fixture.expectedEnv).every(([name, value]) => env[name] === value),
    true,
    "the retained managed secret bundle must be restored"
  );
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
    false
  );
  assert.equal(
    replica.orchestrator.getWorkspace("prj_rollback").containerId,
    fixture.slot.containerId
  );
  await replica.orchestrator.stopWorkspace("prj_rollback");
  await fixture.docker.removeContainer(fixture.slot.containerId);
  await replica.orchestrator.wakeWorkspace("prj_rollback");
  const found = await fixture.docker.inspectContainer("evcp-ws-warm-resource-1");
  assert.equal(
    Object.entries(fixture.expectedEnv).every(([name, value]) =>
      found.env.includes(`${name}=${value}`)
    ),
    true
  );
  assert.equal(found.running, true);
  assert.deepEqual(fixture.releasedSchemas, []);
  assert.deepEqual(fixture.releasedBuckets, []);
  assert.deepEqual(fixture.revokedKeys, []);
});

test("partial matching managed rows are completed without changing existing ciphertext or custom secrets", async () => {
  const fixture = await createRetainedRuntimeFixture();
  await fixture.deps.secrets.put("prj_rollback", "DATABASE_URL", fixture.expectedEnv.DATABASE_URL);
  await fixture.deps.secrets.put("prj_rollback", "CUSTOM_SETTING", "keep-me");
  const before = fixture.secretSql.rows.get("prj_rollback/DATABASE_URL").ciphertext;
  await fixture.createReplica().boot();
  const env = await fixture.deps.secrets.resolveEnv("prj_rollback");
  assert.equal(
    Object.entries(fixture.expectedEnv).every(([name, value]) => env[name] === value),
    true
  );
  assert.equal(env.CUSTOM_SETTING, "keep-me");
  assert.equal(fixture.secretSql.rows.get("prj_rollback/DATABASE_URL").ciphertext, before);
});

test("complete newer managed secrets survive redundant claim retirement without replacement", async () => {
  const fixture = await createRetainedRuntimeFixture();
  for (const [name, value] of Object.entries(fixture.expectedEnv))
    await fixture.deps.secrets.put("prj_rollback", name, value);
  await fixture.deps.secrets.rotate("prj_rollback", "LLM_GATEWAY_KEY", "newer-rotation");
  const encrypted = [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({
    name,
    ciphertext
  }));
  await fixture.createReplica().boot();
  assert.equal(
    (await fixture.deps.secrets.resolveEnv("prj_rollback")).LLM_GATEWAY_KEY === "newer-rotation",
    true
  );
  assert.equal(
    JSON.stringify(
      [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({ name, ciphertext }))
    ) === JSON.stringify(encrypted),
    true
  );
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
    false
  );
});

test("partial mixed managed rows preserve the encrypted allocation for reconciliation without overwrite", async () => {
  const fixture = await createRetainedRuntimeFixture();
  await fixture.deps.secrets.put("prj_rollback", "DATABASE_URL", fixture.expectedEnv.DATABASE_URL);
  await fixture.deps.secrets.rotate("prj_rollback", "LLM_GATEWAY_KEY", "newer-rotation");
  const before = [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({
    name,
    ciphertext
  }));
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  assert.equal(
    JSON.stringify(
      [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({ name, ciphertext }))
    ) === JSON.stringify(before),
    true
  );
  await assertRetained(fixture);
});

test("failed repair persistence is atomic and retains the bundle until a successful retry", async () => {
  const fixture = await createRetainedRuntimeFixture();
  let writes = 0;
  fixture.secretSql.beforeQuery = async (sql) => {
    if (sql.includes("DO NOTHING") && ++writes === 3)
      throw new Error("injected persistence failure");
  };
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  assert.equal(fixture.secretSql.rows.size, 0);
  await assertRetained(fixture);
  fixture.secretSql.beforeQuery = undefined;
  await fixture.createReplica().boot();
  assert.equal((await fixture.deps.secrets.listNames("prj_rollback")).length, 6);
});

test("a rotation between repair inventory and its atomic write cannot be overwritten", async () => {
  const fixture = await createRetainedRuntimeFixture();
  await fixture.deps.secrets.put("prj_rollback", "DATABASE_URL", fixture.expectedEnv.DATABASE_URL);
  const repair = fixture.secretSql.persistence.repairProvisioning;
  const other = createProjectSecretStore({
    encryptionKeyHex: "2".repeat(64),
    persistence: fixture.secretSql.persistence
  });
  fixture.secretSql.persistence.repairProvisioning = async (...args) => {
    await other.rotate("prj_rollback", "DATABASE_URL", "newer-database-value");
    return repair(...args);
  };
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  await other.hydrate();
  assert.equal(
    (await other.resolveEnv("prj_rollback")).DATABASE_URL === "newer-database-value",
    true
  );
  assert.equal((await other.listNames("prj_rollback")).length, 1);
  await assertRetained(fixture);
});

test("a lost committed repair response preserves preparation and retries without replacing ciphertext", async () => {
  const fixture = await createRetainedRuntimeFixture();
  const repair = fixture.secretSql.persistence.repairProvisioning;
  fixture.secretSql.persistence.repairProvisioning = async (...args) => {
    await repair(...args);
    throw new Error("repair response unavailable");
  };
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  assert.equal(fixture.secretSql.rows.size, 6);
  await assertRetained(fixture);
  const encrypted = [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({
    name,
    ciphertext
  }));
  fixture.secretSql.persistence.repairProvisioning = repair;
  await fixture.createReplica().boot();
  assert.equal(
    JSON.stringify(
      [...fixture.secretSql.rows.values()].map(({ name, ciphertext }) => ({ name, ciphertext }))
    ) === JSON.stringify(encrypted),
    true
  );
  assert.equal(
    (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
    false
  );
});

test("a delayed committed repair cannot publish after lease takeover or undo a successor rotation", async () => {
  const fixture = await createRetainedRuntimeFixture();
  const repair = fixture.secretSql.persistence.repairProvisioning;
  fixture.secretSql.persistence.repairProvisioning = async (...args) => {
    const result = await repair(...args);
    fixture.persistence.advance(1_001);
    await fixture.runtimeRecords.provisioningLeases.acquire("prj_rollback", "successor", 1_000);
    await fixture.deps.secrets.rotate("prj_rollback", "LLM_GATEWAY_KEY", "successor-rotation");
    return result;
  };
  await assert.rejects(
    fixture.createReplica().boot(),
    /secret repair is incomplete; retry reconciliation/
  );
  assert.equal(
    (await fixture.deps.secrets.resolveEnv("prj_rollback")).LLM_GATEWAY_KEY ===
      "successor-rotation",
    true
  );
  await assertRetained(fixture);
});

for (const failure of ["compatibility", "container-id", "bundle", "health", "lease-takeover"]) {
  test(`unprovable owned secret repair (${failure}) preserves durable preparation`, async () => {
    const fixture = await createRetainedRuntimeFixture();
    if (failure === "compatibility") fixture.deps.image = "evcp/workspace-next:newer";
    if (failure === "container-id")
      await fixture.runtimeRecords.save({
        ...fixture.snapshot,
        record: { ...fixture.snapshot.record, containerId: "different-container" }
      });
    if (failure === "bundle")
      await fixture.store.recordPreparedResources(fixture.slot.id, { secretPayload: "corrupt" });
    if (failure === "health" || failure === "lease-takeover") {
      fixture.docker.execInContainer = async () => {
        if (failure === "lease-takeover") {
          fixture.persistence.advance(1_001);
          await fixture.runtimeRecords.provisioningLeases.acquire(
            "prj_rollback",
            "successor",
            1_000
          );
        }
        return { stdout: "", stderr: "unhealthy", exitCode: failure === "health" ? 1 : 0 };
      };
    }
    await assert.rejects(
      fixture.createReplica().boot(),
      /secret repair is incomplete; retry reconciliation/
    );
    assert.equal((await fixture.deps.secrets.listNames("prj_rollback")).length, 0);
    assert.equal(
      (await fixture.store.list()).some(({ id }) => id === fixture.slot.id),
      true
    );
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, true);
    assert.deepEqual(fixture.releasedSchemas, []);
  });
}
