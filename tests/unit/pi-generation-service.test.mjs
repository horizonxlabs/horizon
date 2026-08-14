import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
const template = { name: "Web App", lockedFiles: ["package.json"], files: [] };

async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function baseDeps(executor, lifecycle) {
  const memory = createMemoryChatHistoryStore();
  return {
    governedAiExecutor: executor,
    chatHistory: {
      ...memory,
      async appendMessage(message) {
        lifecycle.push(`append:${message.role}`);
        return memory.appendMessage(message);
      }
    },
    actionRunner: {
      async runAction(input) {
        lifecycle.push(`tool:${input.action.type}`);
        return { ok: true, stdout: "" };
      },
      async syncMigrationArtifacts() {
        lifecycle.push("sync:migrations");
        return { ok: true, stdout: "" };
      },
      async runMigrationBatch() {
        lifecycle.push("migrate:batch");
        return { ok: true, stdout: "" };
      }
    },
    template,
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        lifecycle.push("prepare:base");
        return "base-sha";
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {
        lifecycle.push("restore");
      }
    },
    async commitAllChanges() {
      lifecycle.push("commit:candidate");
      return "candidate-sha";
    },
    checkpoints: {
      async createCheckpoint() {
        lifecycle.push("checkpoint");
      }
    },
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: [],
      productSpec: "Confirmed PRD baseline"
    }),
    limits: {
      maxModelRounds: 4,
      maxToolCalls: 8,
      shellTimeoutMs: 5_000,
      maxToolOutputBytes: 4_096,
      maxFileBytes: 10_000,
      turnTimeoutMs: 30_000,
      validationRetries: 1,
      maxToolInputBytes: 10_000
    }
  };
}

test("Plan mode streams Pi text/reasoning and persists without mutable lifecycle", async () => {
  const lifecycle = [];
  const executor = {
    async executeAgentRound(_actor, input, onEvent) {
      onEvent({ type: "thinking_delta", delta: "Inspecting" });
      onEvent({ type: "text_delta", delta: "Plan ready" });
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Inspecting" },
            { type: "text", text: "Plan ready" }
          ],
          timestamp: 2
        },
        usage: { input: 7, output: 3, totalTokens: 10, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle));
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Plan dashboard", agentMode: "plan", actor })
  );

  assert.deepEqual(
    events.map((event) => event.type),
    ["reasoning", "token", "done"]
  );
  assert.deepEqual(lifecycle, ["append:user", "append:assistant"]);
  const history = await service.history("p1");
  assert.equal(history.at(-1).content, "Plan ready");
  assert.equal(history.at(-1).content.includes("Inspecting"), false);
});

test("Build mode coordinates native Pi tool and outer transaction in order", async () => {
  const lifecycle = [];
  let round = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      round += 1;
      const message =
        round === 1
          ? {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: "call-write",
                  name: "write_workspace_file",
                  arguments: { path: "app/page.tsx", content: "export default function Page(){}" }
                }
              ],
              timestamp: 2
            }
          : {
              role: "assistant",
              content: [{ type: "text", text: "Built dashboard" }],
              timestamp: 3
            };
      return {
        status: "succeeded",
        message,
        usage: { input: 10, output: 5, totalTokens: 15, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle));
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.equal(events.find((event) => event.type === "error")?.message, undefined);
  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "tool:file",
    "validate",
    "sync:migrations",
    "commit:candidate",
    "migrate:batch",
    "checkpoint",
    "append:assistant"
  ]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["action_start", "action_result", "commit", "done"]
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.content, "Built dashboard");
  assert.deepEqual(assistant.artifactActionIds, ["call-write"]);
  assert.equal(assistant.actions[0].type, "file");
  assert.equal(assistant.commitSha, "candidate-sha");
  assert.deepEqual(assistant.tokenUsage, { promptTokens: 20, completionTokens: 10 });
  assert.equal(JSON.stringify(assistant).includes("sk-"), false);
});
