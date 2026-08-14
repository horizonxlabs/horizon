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

test("runShellStreaming strips ANSI codes from streamed chunks — chat never shows [33m garbage", async () => {
  const { runShellStreaming } = await import(
    "../../apps/platform-api/src/generation-loop/generation-stream-helpers.ts"
  );
  const ESC = "\u001B";
  const actionRunner = {
    async runAction({ onShellOutput }) {
      onShellOutput(`${ESC}[33mwarn${ESC}[39m deprecated\r\n`);
      onShellOutput(`${ESC}[2K${ESC}[1G Linting and checking validity of types\n`);
      return { ok: true, stdout: "", stderr: "", exitCode: 0 };
    }
  };
  const events = [];
  const generator = runShellStreaming(
    actionRunner,
    template,
    "c1",
    "p1",
    { id: "a1", type: "shell", command: "npm run build" },
    "a1"
  );
  let step = await generator.next();
  while (!step.done) {
    events.push(step.value);
    step = await generator.next();
  }
  const text = events.map((event) => event.content).join("");
  assert.ok(!text.includes(ESC), "no escape bytes reach the chat stream");
  assert.ok(!text.includes("[33m"));
  assert.match(text, /warn deprecated/);
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
