import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

test("successful file-action turn streams tokens, action_result, commit, then done", async () => {
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

  const scriptedReply =
    'Sure, I will add it.\n<artifact id="a1" title="add page">' +
    '<action type="file" filePath="app/page.tsx">export default function Home(){}</action>' +
    "</artifact>";

  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "commit-sha-1"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add home page" }));

  assert.ok(events.some((event) => event.type === "token"));
  const actionResult = events.find((event) => event.type === "action_result");
  assert.equal(actionResult.ok, true);
  const commit = events.find((event) => event.type === "commit");
  assert.equal(commit.sha, "commit-sha-1");
  assert.equal(events.at(-1).type, "done");
});

test("retries failing shell action stops after 2 failed rounds, surfacing an error event", async () => {
  const docker = createMemoryDockerEngine();
  let execAttempts = 0;
  docker.execInContainer = async (_containerId, _cmd) => {
    execAttempts += 1;
    return { stdout: "", stderr: "boom\n", exitCode: 1 };
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

  const scriptedReply = '<artifact id="a1" title="x"><action type="shell">npm run build</action></artifact>';
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply, scriptedReply, scriptedReply]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "commit-sha-2"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build it" }));

  const errorEvent = events.find((event) => event.type === "error");
  assert.ok(errorEvent, "expected an error event after exhausting retries");
  assert.match(errorEvent.message, /npm run build/);
  assert.equal(events.some((event) => event.type === "commit"), false);
  assert.equal(events.at(-1).type, "done");
  assert.equal(execAttempts, 3, "expected exactly 3 attempts (initial + 2 retries)");
});
