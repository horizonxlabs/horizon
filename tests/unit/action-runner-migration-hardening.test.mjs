import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

async function createContainer(docker) {
  return docker.createContainer({
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
}

test("empty migration batch is a no-op even when database and evidence stores are unavailable", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await createContainer(docker);
  let evidenceReads = 0;
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: {
      async recordMigration() {
        throw new Error("not expected");
      },
      async recordMigrations() {
        throw new Error("database unavailable");
      },
      async listMigrations() {
        evidenceReads += 1;
        throw new Error("database unavailable");
      }
    },
    async runMigrationBatchSql() {
      throw new Error("Postgres unavailable");
    }
  });

  const result = await runner.runMigrationBatch({
    containerId,
    projectId: "p1",
    commitSha: "deadbeef",
    actions: []
  });

  assert.deepEqual(result, {
    ok: true,
    stdout: "",
    databaseMigrationOutcome: "not_applied"
  });
  assert.equal(evidenceReads, 0);
  assert.deepEqual(docker.state.execCalls, []);
});

test("migration batch rejects transaction-control SQL before Docker or database execution", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await createContainer(docker);
  const databaseCalls = [];
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore(),
    runMigrationBatchSql: async (...args) => databaseCalls.push(args)
  });
  const statements = [
    "BEGIN; SELECT 'TOP_SECRET'",
    "START TRANSACTION; SELECT 'TOP_SECRET'",
    "COMMIT",
    "ROLLBACK TO SAVEPOINT prior",
    "SAVEPOINT nested",
    "RELEASE SAVEPOINT nested",
    "PREPARE TRANSACTION 'TOP_SECRET'",
    "COMMIT PREPARED 'TOP_SECRET'",
    "ROLLBACK PREPARED 'TOP_SECRET'",
    "ABORT",
    "ABORT WORK",
    "ABORT TRANSACTION",
    "END",
    "END WORK",
    "END TRANSACTION"
  ];

  for (const [index, sql] of statements.entries()) {
    const result = await runner.runMigrationBatch({
      containerId,
      projectId: "p1",
      commitSha: "deadbeef",
      actions: [{ id: `m${index}`, type: "migration", name: `unsafe_${index}`, sql }]
    });
    assert.equal(result.ok, false);
    assert.equal(result.databaseMigrationOutcome, "not_applied");
    assert.match(result.error, /transaction control.*not allowed/i);
    assert.doesNotMatch(JSON.stringify(result), /TOP_SECRET/);
  }

  assert.deepEqual(databaseCalls, []);
  assert.deepEqual(docker.state.execCalls, []);
});

test("migration evidence uses one atomic batch write", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await createContainer(docker);
  let singleWrites = 0;
  let batchWrites = 0;
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: {
      async recordMigration() {
        singleWrites += 1;
        throw new Error("single evidence writes are forbidden");
      },
      async recordMigrations() {
        batchWrites += 1;
        throw new Error("second evidence record failed");
      },
      async listMigrations() {
        return [];
      }
    }
  });

  const result = await runner.runMigrationBatch({
    containerId,
    projectId: "p1",
    commitSha: "deadbeef",
    actions: [
      { id: "m1", type: "migration", name: "first", sql: "CREATE TABLE first(id text)" },
      { id: "m2", type: "migration", name: "second", sql: "CREATE TABLE second(id text)" }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /second evidence record failed/);
  assert.equal(batchWrites, 1);
  assert.equal(singleWrites, 0);
});

test("migration failure reports when SQL applied before evidence persistence failed", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await createContainer(docker);
  docker.execInContainer = async () => ({
    stdout: "postgresql://project@postgres/evcp?schema=app_project",
    stderr: "",
    exitCode: 0
  });
  let sqlBatches = 0;
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: {
      async recordMigration() {
        throw new Error("not expected");
      },
      async recordMigrations() {
        throw new Error("evidence acknowledgement lost");
      },
      async listMigrations() {
        return [];
      }
    },
    async runMigrationBatchSql() {
      sqlBatches += 1;
    }
  });

  const result = await runner.runMigrationBatch({
    containerId,
    projectId: "p1",
    commitSha: "deadbeef",
    actions: [
      { id: "m1", type: "migration", name: "create_items", sql: "CREATE TABLE items(id text)" }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.databaseMigrationOutcome, "applied");
  assert.match(result.error, /evidence acknowledgement lost/);
  assert.equal(sqlBatches, 1);
});

test("migration SQL rejection is conservatively reported as may_have_applied", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await createContainer(docker);
  docker.execInContainer = async () => ({
    stdout: "postgresql://project@postgres/evcp?schema=app_project",
    stderr: "",
    exitCode: 0
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore(),
    async runMigrationBatchSql() {
      throw new Error("SQL acknowledgement lost");
    }
  });

  const result = await runner.runMigrationBatch({
    containerId,
    projectId: "p1",
    commitSha: "deadbeef",
    actions: [{ id: "m1", type: "migration", name: "items", sql: "CREATE TABLE items(id text)" }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.databaseMigrationOutcome, "may_have_applied");
  assert.match(result.error, /acknowledgement lost/);
});
