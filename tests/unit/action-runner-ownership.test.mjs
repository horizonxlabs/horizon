import test from "node:test";
import assert from "node:assert/strict";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const template = { name: "nextjs-base", lockedFiles: [], files: [] };
const evcpCommand = ["su", "-s", "/bin/sh", "evcp", "-c"];

test("writes edit results as evcp", async () => {
  const calls = [];
  const docker = {
    async execInContainer(containerId, cmd) {
      calls.push({ containerId, cmd });
      if ((cmd.at(-1) ?? "").startsWith("base64 app/page.tsx")) {
        return {
          stdout: Buffer.from("const x = 1;", "utf8").toString("base64"),
          stderr: "",
          exitCode: 0
        };
      }
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
      id: "edit-1",
      type: "edit",
      filePath: "app/page.tsx",
      find: "const x = 1;",
      replace: "const x = 2;"
    }
  });

  assert.equal(result.ok, true);
  const write = calls.find((call) => (call.cmd.at(-1) ?? "").includes("base64 -d > app/page.tsx"));
  assert.ok(write, "expected edit writeback");
  assert.deepEqual(write.cmd.slice(0, 5), evcpCommand);
});

test("materializes migration artifacts as evcp", async () => {
  const calls = [];
  const docker = {
    async execInContainer(containerId, cmd) {
      calls.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.syncMigrationArtifacts({
    containerId: "c1",
    projectId: "p1",
    actions: [
      { id: "migration-1", type: "migration", name: "add_users", sql: "CREATE TABLE users();" }
    ]
  });

  assert.equal(result.ok, true);
  assert.match(calls[0].cmd.at(-1), /mkdir -p prisma\/migrations\/add_users/);
  assert.deepEqual(calls[0].cmd.slice(0, 5), evcpCommand);
});
