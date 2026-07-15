import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("later migration failure restores source and creates neither migration evidence nor checkpoint", async () => {
  const checkpoints = createMemoryCheckpointStore();
  const lifecycle = [];
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      '<artifact id="schema" title="schema">' +
        '<action type="migration" filePath="create_users">CREATE TABLE users(id text)</action>' +
        '<action type="migration" filePath="broken_index">CREATE INDEX broken</action>' +
        "</artifact>"
    ]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: {
      runAction: async () => {
        throw new Error("migrations must use the atomic batch path");
      },
      runMigrationBatch: async ({ actions, commitSha }) => {
        lifecycle.push(`batch:${commitSha}:${actions.map((action) => action.name).join(",")}`);
        return {
          ok: false,
          error: "migration failed: second migration failed",
          stdout: "",
          stderr: "second migration failed",
          exitCode: 1
        };
      }
    },
    errorFeedback: createErrorFeedbackTracker(),
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard: {
      prepare: async () => {
        lifecycle.push("prepare");
        return "known-good";
      },
      validate: async () => lifecycle.push("validate"),
      restore: async (_projectId, sha) => lifecycle.push(`restore:${sha}`)
    },
    commitAllChanges: async () => {
      lifecycle.push("commit");
      return "candidate-sha";
    },
    checkpoints
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add schema" }));

  assert.deepEqual(lifecycle, [
    "prepare",
    "validate",
    "commit",
    "batch:candidate-sha:create_users,broken_index",
    "restore:known-good"
  ]);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.match(events.find((event) => event.type === "error").message, /second migration failed/);
  assert.deepEqual(await checkpoints.listCheckpoints("p1"), []);
});
