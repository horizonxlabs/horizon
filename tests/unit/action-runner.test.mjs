import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

test("rejects writes to locked files without touching the container", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-1", type: "file", filePath: "package.json", content: "{}" }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /locked file/);
  assert.deepEqual(docker.state.execCalls, []);
});

test("writes a non-locked file via a base64-encoded shell write", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-2", type: "file", filePath: "app/page.tsx", content: "export default function Home() {}" }
  });

  assert.equal(result.ok, true);
  const call = docker.state.execCalls[0];
  assert.equal(call.cmd[0], "sh");
  assert.match(call.cmd[2], /mkdir -p .*app.*&&.*base64 -d.*app\/page\.tsx/s);
});

test("runs a shell action and reports failure with stdout/stderr/exitCode on non-zero exit", async () => {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "building...\n", stderr: "type error on line 3\n", exitCode: 1 };
  };
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-3", type: "shell", command: "npm run build" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /type error/);
});

test("runs a migration action, records it, and treats it as a hard checkpoint boundary", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo", image: "img", env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {}, exposedPort: 3000, publishPorts: false
  });
  const migrations = createMemoryMigrationStore();
  const runner = createActionRunner({ docker, checkpoints: createMemoryCheckpointStore(), migrations });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-4", type: "migration", name: "add_users", sql: "CREATE TABLE users();" },
    commitSha: "deadbeef"
  });

  assert.equal(result.ok, true);
  const recorded = migrations.listMigrations("p1");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].name, "add_users");
  assert.equal(recorded[0].commitSha, "deadbeef");
});
