import test from "node:test";
import assert from "node:assert/strict";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

test("materializes applied and pending migrations into the workspace before commit", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
  const migrations = createMemoryMigrationStore();
  await migrations.recordMigration({
    projectId: "p1",
    name: "act-1",
    sql: "CREATE TABLE sales(id text);",
    commitSha: "old-sha"
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations
  });

  const result = await runner.syncMigrationArtifacts({
    containerId,
    projectId: "p1",
    actions: [
      {
        id: "m2",
        type: "migration",
        name: "add_targets",
        sql: "ALTER TABLE sales ADD COLUMN target int;"
      }
    ]
  });

  assert.equal(result.ok, true);
  const scripts = docker.state.execCalls.map((call) => call.cmd.at(-1) ?? "").join("\n");
  assert.match(scripts, /prisma\/migrations\/act-1\/migration\.sql/);
  assert.match(scripts, /prisma\/migrations\/add_targets\/migration\.sql/);
});
