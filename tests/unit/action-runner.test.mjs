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
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
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

async function makeRunner() {
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
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  return { docker, containerId, runner };
}

test("rejects a file write whose content carries a git conflict marker", async () => {
  const { docker, containerId, runner } = await makeRunner();
  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: {
      id: "act-1",
      type: "file",
      filePath: "app/page.tsx",
      content: "function a() {}\n=======\nfunction a() {}\n"
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /conflict marker/);
  assert.deepEqual(docker.state.execCalls, [], "must not write the broken file to the container");
});

test("rejects an edit whose REPLACE text carries a git conflict marker", async () => {
  const { runner, containerId } = await makeRunner();
  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: {
      id: "act-2",
      type: "edit",
      filePath: "app/page.tsx",
      find: "const x = 1;",
      replace: "const x = 2;\n>>>>>>> REPLACE\nconst y = 3;"
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /conflict marker/);
});

test("writes a non-locked file via a base64-encoded shell write", async () => {
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
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: {
      id: "act-2",
      type: "file",
      filePath: "app/page.tsx",
      content: "export default function Home() {}"
    }
  });

  assert.equal(result.ok, true);
  // the drift guard runs a `wc -c` size check first, then the base64 write; find the write call
  const call = docker.state.execCalls.find((c) =>
    /mkdir -p .*app.*&&.*base64 -d.*app\/page\.tsx/s.test(c.cmd[2] ?? "")
  );
  assert.ok(call, "expected a base64 write to app/page.tsx");
  assert.equal(call.cmd[0], "sh");
});

test("runs a shell action and reports failure with stdout/stderr/exitCode on non-zero exit", async () => {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "building...\n", stderr: "type error on line 3\n", exitCode: 1 };
  };
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
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
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
  const migrations = createMemoryMigrationStore();
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations
  });

  const result = await runner.runAction({
    containerId,
    projectId: "p1",
    template,
    action: { id: "act-4", type: "migration", name: "add_users", sql: "CREATE TABLE users();" },
    commitSha: "deadbeef"
  });

  assert.equal(result.ok, true);
  const recorded = await migrations.listMigrations("p1");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].name, "add_users");
  assert.equal(recorded[0].commitSha, "deadbeef");
});

test("migration batch is one database transaction and records nothing when a later statement fails", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo",
    image: "img",
    env: ["DATABASE_URL=postgresql://project@postgres/evcp?schema=app_project"],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
  docker.execInContainer = async (_containerId, command) =>
    command.at(-1) === 'printf %s "$DATABASE_URL"'
      ? {
          stdout: "postgresql://project@postgres/evcp?schema=app_project",
          stderr: "",
          exitCode: 0
        }
      : { stdout: "", stderr: "", exitCode: 0 };
  const migrations = createMemoryMigrationStore();
  const batches = [];
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations,
    runMigrationBatchSql: async (databaseUrl, statements) => {
      batches.push({ databaseUrl, statements });
      throw new Error("second migration failed");
    }
  });

  const result = await runner.runMigrationBatch({
    containerId,
    projectId: "p1",
    commitSha: "deadbeef",
    actions: [
      { id: "m1", type: "migration", name: "create_users", sql: "CREATE TABLE users(id text)" },
      { id: "m2", type: "migration", name: "broken_index", sql: "CREATE INDEX broken" }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /second migration failed/);
  assert.deepEqual(batches, [
    {
      databaseUrl: "postgresql://project@postgres/evcp?schema=app_project",
      statements: ["CREATE TABLE users(id text)", "CREATE INDEX broken"]
    }
  ]);
  assert.deepEqual(await migrations.listMigrations("p1"), []);
});

// Drift guard: a whole-file write to a substantial existing file is rejected and redirected to edit.
function stubDockerWithSizes(sizeByPath) {
  const execCalls = [];
  return {
    state: { execCalls },
    async execInContainer(containerId, cmd) {
      execCalls.push({ containerId, cmd });
      const script = cmd[cmd.length - 1] || "";
      const m = script.match(/wc -c < (\S+)/);
      if (m) return { stdout: String(sizeByPath[m[1]] ?? -1), stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

test("drift guard: rejects a whole-file write to a large existing file, steering to edit", async () => {
  const docker = stubDockerWithSizes({ "app/page.tsx": 5000 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/page.tsx", content: "whole new file" }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /edit/i);
  // it must NOT have written anything (no base64 decode write)
  assert.ok(!docker.state.execCalls.some((c) => (c.cmd.at(-1) || "").includes("base64 -d")));
});

test("drift guard: allows a whole-file write to a small existing file (weaker models do this reliably)", async () => {
  const docker = stubDockerWithSizes({ "app/api/route.ts": 700 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: {
      id: "a1",
      type: "file",
      filePath: "app/api/route.ts",
      content: "export const GET = () => Response.json({ ok: true });\n"
    }
  });
  assert.equal(result.ok, true);
  assert.ok(docker.state.execCalls.some((c) => (c.cmd.at(-1) || "").includes("base64 -d")));
});

test("rejects a file write carrying leaked conflict markers", async () => {
  const writes = [];
  const docker = {
    state: { execCalls: writes },
    async execInContainer(containerId, cmd) {
      writes.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: {
      id: "a1",
      type: "file",
      filePath: "app/config.ts",
      content:
        "<<<<<<< SEARCH\nexport const value = 1;\n=======\nexport const value = 2;\n>>>>>>> REPLACE"
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /conflict marker/);
  assert.equal(writes.length, 0);
});

test("drift guard: allows a whole-file write to the tiny starter (first build) and to new files", async () => {
  const docker = stubDockerWithSizes({ "app/page.tsx": 115, "app/new.tsx": -1 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const starter = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/page.tsx", content: "real homepage" }
  });
  assert.equal(starter.ok, true, "starter-size file may be overwritten");
  const created = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a2", type: "file", filePath: "app/new.tsx", content: "brand new" }
  });
  assert.equal(created.ok, true, "new file may be created");
});
