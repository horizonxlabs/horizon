import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import {
  workspaceShellCleanupCommand,
  workspaceShellCommand
} from "../../apps/platform-api/src/generation-loop/workspace-shell-command.ts";

const token = "11111111-1111-4111-8111-111111111111";
const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

test("package commands use one root-recorded session and a validating TERM/KILL cleanup", () => {
  const command = workspaceShellCommand(
    { id: "a1", type: "shell", command: "pnpm", args: ["install", "--ignore-scripts"] },
    5_000,
    token
  ).at(-1);
  const terminate = workspaceShellCleanupCommand(token, {
    removeToken: false,
    waitForToken: true
  }).at(-1);
  const cleanup = workspaceShellCleanupCommand(token).at(-1);

  assert.match(command, /action_parent_owner/);
  assert.match(command, /setsid --wait sh -c/);
  assert.match(command, /printf.*\$\$/);
  assert.match(command, /su -s \/bin\/sh evcp/);
  assert.match(command, /sleep 5.*kill -TERM/);
  assert.match(command, /kill -KILL/);
  assert.match(terminate, /workspace action PGID is missing or invalid/);
  assert.match(terminate, /token_poll/);
  assert.match(terminate, /kill -TERM "-\$action_pgid"/);
  assert.match(terminate, /kill -KILL "-\$action_pgid"/);
  assert.doesNotMatch(terminate, /rm -f "\$action_pgid_file"/);
  assert.match(cleanup, /rm -f "\$action_pgid_file"/);
});

test("missing or invalid cleanup evidence fails a package action closed", async () => {
  let calls = 0;
  const runner = createActionRunner({
    docker: {
      async execInContainer() {
        calls += 1;
        return calls === 1
          ? { stdout: "installed\n", stderr: "", exitCode: 0 }
          : { stdout: "", stderr: "workspace action PGID is missing or invalid", exitCode: 2 };
      }
    },
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });

  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "shell", command: "pnpm", args: ["install"] }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /process cleanup failed.*PGID is missing or invalid/i);
});
