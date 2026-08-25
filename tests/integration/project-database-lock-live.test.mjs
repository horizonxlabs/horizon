import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  insertRow,
  registerProjectDbRoutes
} from "../../apps/platform-api/src/project-database.ts";
import {
  Client,
  createPgTransaction
} from "../../apps/platform-api/src/workspace-orchestrator/pg-runner.ts";
import { schemaAdvisoryLockSql } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

const dockerAvailable = (() => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const postgresImage = "postgres:17-alpine";
const postgresImageAvailable = dockerAvailable && (() => {
  try {
    execFileSync("docker", ["image", "inspect", postgresImage], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("real PostgreSQL schema deletion waits for checked-out mutation transaction commit", {
  skip: !postgresImageAvailable,
  timeout: 30_000
}, async () => {
  const container = `evcp-pg-lock-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", container,
    "-e", "POSTGRES_PASSWORD=evcp", "-p", "127.0.0.1::5432", postgresImage
  ], { stdio: "ignore" });
  try {
    const portOutput = execFileSync("docker", ["port", container, "5432/tcp"], {
      encoding: "utf8"
    }).trim();
    const port = Number(portOutput.slice(portOutput.lastIndexOf(":") + 1));
    const connectionString = `postgresql://postgres:evcp@127.0.0.1:${port}/postgres`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const probe = new Client({ connectionString });
      try {
        await probe.connect();
        await probe.query("SELECT 1");
        await probe.end();
        break;
      } catch {
        await probe.end().catch(() => undefined);
        if (attempt === 59) throw new Error("PostgreSQL test container did not become ready");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const admin = new Client({ connectionString });
    await admin.connect();
    await admin.query("CREATE SCHEMA app_lock; CREATE TABLE app_lock.items (id text PRIMARY KEY)");

    const mutationInserted = deferred();
    const allowCommit = deferred();
    const transaction = createPgTransaction({ connectionString });
    const mutation = transaction(async (query) => {
      await query(schemaAdvisoryLockSql("app_lock"));
      await insertRow(query, "app_lock", "items", { id: "one" }, {
        schema: "app_lock",
        tables: [{
          name: "items",
          columns: [{ name: "id", dataType: "text", nullable: false, isPrimaryKey: true, ordinal: 1 }]
        }]
      });
      mutationInserted.resolve();
      await allowCommit.promise;
    });
    await mutationInserted.promise;

    const deletion = (async () => {
      await admin.query("BEGIN");
      try {
        await admin.query(schemaAdvisoryLockSql("app_lock"));
        await admin.query("DROP SCHEMA app_lock CASCADE");
        await admin.query("COMMIT");
      } catch (error) {
        await admin.query("ROLLBACK");
        throw error;
      }
    })();
    const blocked = await Promise.race([
      deletion.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 150))
    ]);
    allowCommit.resolve();
    await Promise.all([mutation, deletion]);
    assert.equal(blocked, true, "DROP SCHEMA must wait while the mutation transaction owns the lock");
    const result = await admin.query("SELECT to_regnamespace('app_lock') IS NULL AS removed");
    assert.equal(result.rows[0].removed, true);

    await admin.query(`
      CREATE SCHEMA app_takeover;
      CREATE TABLE app_takeover.items (id text PRIMARY KEY);
      CREATE FUNCTION app_takeover.pause_insert() RETURNS trigger AS $$
      BEGIN PERFORM pg_sleep(0.25); RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER pause_insert BEFORE INSERT ON app_takeover.items
      FOR EACH ROW EXECUTE FUNCTION app_takeover.pause_insert()
    `);
    let mutate;
    let current = true;
    let failure;
    registerProjectDbRoutes({
      get() {},
      post(path, handler) { if (path.includes("mutate")) mutate = handler; },
      ok() { assert.fail("a mutation that loses its lease before COMMIT must roll back"); },
      fail(_response, status, code) { failure = { status, code }; },
      async resolveAccessibleProjectIds() { return ["p1"]; },
      async getDatabaseUrl() { return `${connectionString}?schema=app_takeover`; },
      createTransaction() { return createPgTransaction({ connectionString }); },
      async runChildMutation(_projectId, operation) {
        return operation({
          async assertCurrent() {
            if (!current) {
              const error = new Error("project deletion took over during DML");
              error.name = "ProjectDeletionInProgressError";
              throw error;
            }
          }
        });
      },
      audit() {}
    });
    setTimeout(() => { current = false; }, 75);
    await mutate({
      params: { projectId: "p1", table: "items" }, headers: {},
      body: { op: "insert", values: { id: "rolled-back" } }
    }, {});
    assert.deepEqual(failure, { status: 409, code: "PROJECT_DELETION_IN_PROGRESS" });
    const rolledBack = await admin.query("SELECT count(*)::int AS count FROM app_takeover.items");
    assert.equal(rolledBack.rows[0].count, 0);
    await admin.end();
  } finally {
    try { execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" }); } catch {}
  }
});
