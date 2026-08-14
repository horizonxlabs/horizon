import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };

test("failed Build keeps files for manual repair and creates no checkpoint", async () => {
  const lifecycle = [];
  let checkpoints = 0;
  const service = createPiGenerationService({
    governedAiExecutor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "succeeded",
          message: { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 2 },
          usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: {
      async runAction() {
        return { ok: true, stdout: "" };
      },
      async syncMigrationArtifacts() {
        return { ok: true, stdout: "" };
      },
      async runMigrationBatch() {
        return { ok: false, error: "migration failed", stdout: "", stderr: "", exitCode: 1 };
      }
    },
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        lifecycle.push("prepare");
        return "base-sha";
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore(_projectId, sha) {
        lifecycle.push(`restore:${sha}`);
      }
    },
    async commitAllChanges() {
      lifecycle.push("commit");
      return "candidate-sha";
    },
    checkpoints: {
      async createCheckpoint() {
        checkpoints += 1;
      }
    },
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: []
    }),
    limits: {
      maxModelRounds: 2,
      maxToolCalls: 4,
      shellTimeoutMs: 1000,
      maxToolOutputBytes: 1024,
      maxFileBytes: 4096,
      turnTimeoutMs: 10000,
      validationRetries: 0,
      maxToolInputBytes: 4096
    }
  });
  const events = [];
  for await (const event of service.runTurn({ projectId: "p1", prompt: "Build", actor })) {
    events.push(event);
  }

  assert.deepEqual(lifecycle, ["prepare", "validate", "commit"]);
  assert.equal(checkpoints, 0);
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.commitSha, null);
});
