import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSecretStore } from "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts";
import { createRuntimeLeaseFixture } from "./workspace-runtime-lease-fixture.mjs";
import { createSecretSqlFixture } from "./workspace-secret-sql-fixture.mjs";

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
