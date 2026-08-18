import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };

async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function packageMutationExecutor() {
  let round = 0;
  return {
    async executeAgentRound(_actor, input) {
      round += 1;
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content:
            round === 1
              ? [
                  {
                    type: "toolCall",
                    id: "call-install",
                    name: "run_workspace_command",
                    arguments: { command: "pnpm", args: ["install"] }
                  }
                ]
              : [{ type: "text", text: "Done" }],
          timestamp: round
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

test("aborted package mutation settles before snapshot restore and release advance", async () => {
  const lifecycle = [];
  const controller = new AbortController();
  let resolveDocker;
  let commandStarted;
  const started = new Promise((resolve) => {
    commandStarted = resolve;
  });
  const docker = {
    execInContainer() {
      lifecycle.push("docker:started");
      commandStarted();
      return new Promise((resolve) => {
        resolveDocker = () => {
          lifecycle.push("docker:settled");
          resolve({ stdout: "", stderr: "", exitCode: 0 });
        };
      });
    }
  };
  const actionRunner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const service = createPiGenerationService({
    governedAiExecutor: packageMutationExecutor(),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner,
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        return "base-sha";
      },
      async hasChanges() {
        throw new Error("not expected after aborted action");
      },
      async validate() {},
      async restore() {},
      async restoreSnapshot(_projectId, snapshot) {
        lifecycle.push(`restore:${snapshot}`);
      },
      async releaseSnapshot(_projectId, snapshot) {
        lifecycle.push(`release:${snapshot}`);
      }
    },
    async commitAllChanges() {
      throw new Error("not expected");
    }
  });
  const running = drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Install the package",
      agentMode: "auto",
      actor,
      signal: controller.signal
    })
  );

  await started;
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    lifecycle.some((entry) => entry.startsWith("restore:")),
    false
  );
  assert.equal(
    lifecycle.some((entry) => entry.startsWith("release:")),
    false
  );

  resolveDocker();
  const events = await running;
  const settledAt = lifecycle.indexOf("docker:settled");
  const restoredAt = lifecycle.indexOf("restore:base-sha");
  const releasedAt = lifecycle.indexOf("release:base-sha");
  assert.ok(
    settledAt >= 0 && restoredAt > settledAt && releasedAt > restoredAt,
    lifecycle.join(",")
  );
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
});
