import test from "node:test";
import assert from "node:assert/strict";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

test("shell action streams merged output via onShellOutput and returns the accumulated result", async () => {
  const chunks = ["Installing...\n", "added 1 package\n"];
  const docker = {
    async execInContainer() {
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async execInContainerStream(_containerId, _cmd, onChunk) {
      for (const chunk of chunks) onChunk(chunk);
      return { exitCode: 0 };
    }
  };
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const streamed = [];
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "shell", command: "npm install foo" },
    onShellOutput: (chunk) => streamed.push(chunk)
  });
  assert.deepEqual(streamed, chunks);
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "Installing...\nadded 1 package\n");
});

test("shell action falls back to buffered execInContainer when no onShellOutput is given", async () => {
  let streamedUsed = false;
  const docker = {
    async execInContainer() {
      return { stdout: "done\n", stderr: "", exitCode: 0 };
    },
    async execInContainerStream() {
      streamedUsed = true;
      return { exitCode: 0 };
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
    action: { id: "a1", type: "shell", command: "echo done" }
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "done\n");
  assert.equal(streamedUsed, false);
});

test("Pi shell actions run as the unprivileged workspace owner, bound output, and honor pre-abort", async () => {
  const calls = [];
  const docker = {
    async execInContainer(containerId, command) {
      calls.push({ containerId, command });
      return { stdout: "x".repeat(100), stderr: "", exitCode: 0 };
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
    action: { id: "a1", type: "shell", command: "pnpm", args: ["test"] },
    maxOutputBytes: 12
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout.length, 12);
  assert.deepEqual(calls[0].command.slice(0, 5), ["su", "-s", "/bin/sh", "evcp", "-c"]);
  assert.match(calls[0].command[5], /cd \/workspace && exec 'pnpm' 'test'/);

  const controller = new AbortController();
  controller.abort();
  const aborted = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a2", type: "shell", command: "pnpm", args: ["test"] },
    signal: controller.signal
  });
  assert.equal(aborted.ok, false);
  assert.match(aborted.error, /aborted/);
  assert.equal(calls.length, 1);
});

test("npm build validates in a disposable tree without replacing the live preview cache", async () => {
  const calls = [];
  const docker = {
    async execInContainer(containerId, command) {
      calls.push({ containerId, command });
      return { stdout: "build passed\n", stderr: "", exitCode: 0 };
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
    action: { id: "a-build", type: "shell", command: "npm", args: ["run", "build"] }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].command.slice(0, 5), ["su", "-s", "/bin/sh", "evcp", "-c"]);
  const script = calls[0].command[5];
  assert.match(script, /mktemp -d \/tmp\/evcp-agent-validation/);
  assert.match(script, /--exclude=\.next/);
  assert.match(script, /EVCP_VALIDATION_DIST_DIR=\.next/);
  assert.doesNotMatch(script, /cd \/workspace && exec 'npm' 'run' 'build'/);
});
