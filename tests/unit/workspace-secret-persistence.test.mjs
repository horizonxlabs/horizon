import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";
import { createProvisioningLeaseCoordinator } from "../../apps/platform-api/src/workspace-orchestrator/provisioning-lease.ts";

const env = {
  DATABASE_URL: "database",
  S3_ENDPOINT: "endpoint",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "access",
  S3_SECRET_KEY: "secret",
  LLM_GATEWAY_KEY: "llm"
};

function setup() {
  const runtime = createRuntimeLeaseFixture();
  const sql = createSecretSqlFixture(runtime);
  const createStore = () =>
    createProjectSecretStore({ encryptionKeyHex: "3".repeat(64), persistence: sql.persistence });
  const attempt = (token) => ({
    token,
    async assertOwned() {
      if (!(await runtime.createStore().provisioningLeases.renew("prj_secrets", token, 1000))) {
        throw new Error("workspace provisioning lease is no longer owned");
      }
    }
  });
  return { runtime, sql, createStore, attempt };
}

test("provisioning replaces all six ciphertext rows atomically and rollback removes only its attempt", async () => {
  const fixture = setup();
  const store = fixture.createStore();
  await fixture.runtime.createStore().provisioningLeases.acquire("prj_secrets", "first", 1000);
  await store.replaceForProvisioning("prj_secrets", env, fixture.attempt("first"));
  assert.equal(fixture.sql.transactions, 1);
  assert.equal(fixture.sql.rows.size, 6);
  assert.ok([...fixture.sql.rows.values()].every((row) => row.provisioning_token === "first"));
  const previous = structuredClone(fixture.sql.rows);
  let writes = 0;
  fixture.sql.beforeQuery = async (sql) => {
    if (sql.includes("INSERT INTO project_secrets") && ++writes === 3)
      throw new Error("third write failed");
  };
  await assert.rejects(
    store.replaceForProvisioning(
      "prj_secrets",
      { ...env, DATABASE_URL: "changed" },
      fixture.attempt("first")
    ),
    /third write failed/
  );
  assert.deepEqual(fixture.sql.rows, previous);
  assert.deepEqual(await store.resolveEnv("prj_secrets"), env);
  fixture.sql.beforeQuery = undefined;
  await store.rotate("prj_secrets", "S3_SECRET_KEY", "user-rotation");
  await store.removeProvisioning("prj_secrets", "first");
  assert.deepEqual(await store.resolveEnv("prj_secrets"), { S3_SECRET_KEY: "user-rotation" });
  const hydrated = fixture.createStore();
  await hydrated.hydrate();
  assert.deepEqual(await hydrated.resolveEnv("prj_secrets"), { S3_SECRET_KEY: "user-rotation" });
});

test("a stale transaction cannot overwrite successor credentials even when the caller's precheck passed", async () => {
  const fixture = setup();
  const store = fixture.createStore();
  await fixture.runtime.createStore().provisioningLeases.acquire("prj_secrets", "first", 1000);
  fixture.runtime.advance(1000);
  await fixture.runtime.createStore().provisioningLeases.acquire("prj_secrets", "second", 1000);
  await store.replaceForProvisioning("prj_secrets", env, fixture.attempt("second"));
  await assert.rejects(
    store.replaceForProvisioning(
      "prj_secrets",
      { ...env, DATABASE_URL: "stale" },
      {
        token: "first",
        async assertOwned() {
          /* Deliberately model a stale successful precheck. */
        }
      }
    ),
    /lease is no longer owned/
  );
  const hydrated = fixture.createStore();
  await hydrated.hydrate();
  assert.deepEqual(await hydrated.resolveEnv("prj_secrets"), env);
  await store.removeProvisioning("prj_secrets", "first");
  assert.equal(fixture.sql.rows.size, 6);
});

test("recovery adoption changes only ownership and preserves a rotation between its boundaries", async () => {
  const fixture = setup();
  const store = fixture.createStore();
  const leases = fixture.runtime.createStore().provisioningLeases;
  await leases.acquire("prj_secrets", "first", 1000);
  await store.replaceForProvisioning("prj_secrets", env, fixture.attempt("first"));
  await leases.release("prj_secrets", "first");
  const coordinator = createProvisioningLeaseCoordinator(() => fixture.runtime.createStore(), {});
  const original = fixture.sql.beforeQuery;
  let rotated;
  let adoptedToken;
  fixture.sql.beforeQuery = async (sql) => {
    await original?.(sql);
    if (sql.includes("SELECT token FROM workspace_provisioning_leases") && !rotated) {
      rotated = true;
      await store.rotate("prj_secrets", "S3_SECRET_KEY", "rotated-during-adoption");
      rotated = structuredClone(fixture.sql.rows.get("prj_secrets/S3_SECRET_KEY"));
      adoptedToken = fixture.runtime.leases.get("prj_secrets").token;
    }
  };
  await coordinator.run("prj_secrets", () => coordinator.adoptSecrets("prj_secrets", store));
  assert.deepEqual(fixture.sql.rows.get("prj_secrets/S3_SECRET_KEY"), {
    ...rotated,
    provisioning_token: adoptedToken
  });
  const fresh = fixture.createStore();
  await fresh.hydrate();
  assert.equal((await fresh.resolveEnv("prj_secrets")).S3_SECRET_KEY, "rotated-during-adoption");
});

test("a delayed replacement response cannot replace a newer rotation in cache", async () => {
  const fixture = setup();
  const store = fixture.createStore();
  await fixture.runtime.createStore().provisioningLeases.acquire("prj_secrets", "first", 1000);
  let release;
  let committed;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    committed = resolve;
  });
  const replace = fixture.sql.persistence.replaceProvisioning.bind(fixture.sql.persistence);
  fixture.sql.persistence.replaceProvisioning = async (...args) => {
    const result = await replace(...args);
    committed();
    await response;
    return result;
  };
  const pending = store.replaceForProvisioning("prj_secrets", env, fixture.attempt("first"));
  await ready;
  await store.rotate("prj_secrets", "S3_SECRET_KEY", "newer-rotation");
  release();
  await pending;
  assert.equal((await store.resolveEnv("prj_secrets")).S3_SECRET_KEY, "newer-rotation");
  await store.removeProvisioning("prj_secrets", "first");
  assert.deepEqual(await store.resolveEnv("prj_secrets"), { S3_SECRET_KEY: "newer-rotation" });
  const fresh = fixture.createStore();
  await fresh.hydrate();
  assert.deepEqual(await fresh.resolveEnv("prj_secrets"), { S3_SECRET_KEY: "newer-rotation" });
});

test("a stale cache refresh cannot overwrite a rotation that finishes during its read", async () => {
  const fixture = setup();
  const store = fixture.createStore();
  await fixture.runtime.createStore().provisioningLeases.acquire("prj_secrets", "first", 1000);
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const committed = deferred(),
    releaseReplacement = deferred(),
    rotationStarted = deferred();
  const releaseRotation = deferred(),
    readStarted = deferred(),
    releaseRead = deferred();
  const persistence = fixture.sql.persistence;
  const replace = persistence.replaceProvisioning.bind(persistence);
  persistence.replaceProvisioning = async (...args) => {
    const result = await replace(...args);
    committed.resolve();
    await releaseReplacement.promise;
    return result;
  };
  const upsert = persistence.upsert.bind(persistence);
  persistence.upsert = async (...args) => {
    rotationStarted.resolve();
    await releaseRotation.promise;
    return upsert(...args);
  };
  const load = persistence.loadAll.bind(persistence);
  persistence.loadAll = async () => {
    const snapshot = await load();
    readStarted.resolve();
    await releaseRead.promise;
    return snapshot;
  };
  const replacing = store.replaceForProvisioning("prj_secrets", env, fixture.attempt("first"));
  await committed.promise;
  const rotating = store.rotate("prj_secrets", "S3_SECRET_KEY", "rotation-during-refresh");
  await rotationStarted.promise;
  releaseReplacement.resolve();
  await readStarted.promise;
  releaseRotation.resolve();
  await rotating;
  releaseRead.resolve();
  await replacing;
  assert.equal((await store.resolveEnv("prj_secrets")).S3_SECRET_KEY, "rotation-during-refresh");
  assert.equal(Object.keys(await store.resolveEnv("prj_secrets")).length, 6);
});
