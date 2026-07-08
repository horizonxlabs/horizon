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

test("plan mode streams read-only LLM analysis without running actions or committing", async () => {
  const chatHistory = createMemoryChatHistoryStore();
  let actionAttempts = 0;
  let commitAttempts = 0;
  let containerLookups = 0;
  let readContextAttempts = 0;

  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      "I would inspect the app/page.tsx entrypoint, then plan the contact form state and validation before switching to Build."
    ]),
    chatHistory,
    actionRunner: {
      runAction: async () => {
        actionAttempts += 1;
        return { ok: true, stdout: "" };
      }
    },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => {
      containerLookups += 1;
      return "container-plan-mode";
    },
    readContextFiles: async () => {
      readContextAttempts += 1;
      return [{ path: "app/page.tsx", content: "export default function Home(){ return null; }" }];
    },
    commitAllChanges: async () => {
      commitAttempts += 1;
      return "commit-sha-plan";
    }
  });

  const events = await collect(
    service.runTurn({ projectId: "p1", prompt: "plan the home page", agentMode: "plan" })
  );

  assert.equal(containerLookups, 1);
  assert.equal(readContextAttempts, 1);
  assert.equal(actionAttempts, 0);
  assert.equal(commitAttempts, 0);
  assert.equal(
    events.some((event) => event.type === "action_result" || event.type === "commit"),
    false
  );
  assert.match(
    events
      .filter((event) => event.type === "token")
      .map((event) => event.content)
      .join(""),
    /inspect the app\/page\.tsx entrypoint/
  );
  assert.equal(events.at(-1).type, "done");
  assert.deepEqual(
    chatHistory.listMessages("p1").map((message) => message.agentMode),
    ["plan", "plan"]
  );
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

  const scriptedReply =
    '<artifact id="a1" title="x"><action type="shell">npm run build</action></artifact>';
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
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(events.at(-1).type, "done");
  assert.equal(execAttempts, 3, "expected exactly 3 attempts (initial + 2 retries)");
});

test("listWorkspaceFiles uses the dedicated workspace file reader", async () => {
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker: createMemoryDockerEngine(),
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    readContextFiles: async () => {
      throw new Error("context reader should not be used for file browser");
    },
    readWorkspaceFiles: async (containerId) => [
      { path: "app/page.tsx", content: `// ${containerId}` }
    ],
    commitAllChanges: async () => "commit-sha-3"
  });

  const files = await service.listWorkspaceFiles("p1");

  assert.deepEqual(files, [{ path: "app/page.tsx", content: "// container-1" }]);
});
