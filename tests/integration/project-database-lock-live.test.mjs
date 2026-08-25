import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { insertRow } from "../../apps/platform-api/src/project-database.ts";
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("real PostgreSQL schema deletion waits for checked-out mutation transaction commit", {
  skip: !dockerAvailable,
  timeout: 30_000
}, async () => {
  const container = `evcp-pg-lock-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", container,
    "-e", "POSTGRES_PASSWORD=evcp", "-p", "127.0.0.1::5432", "postgres:17-alpine"
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
    await admin.end();
  } finally {
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  }
});
