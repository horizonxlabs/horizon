import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };
const workspaceGuard = {
  prepare: async () => "base-sha",
  validate: async () => {},
  restore: async () => {}
};

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("plan mode streams read-only LLM analysis without running actions or committing", async () => {
  const chatHistory = createMemoryChatHistoryStore();
  let actionAttempts = 0;
  let commitAttempts = 0;
  let containerLookups = 0;
  let readContextAttempts = 0;
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      "I would inspect app/page.tsx, then plan validation before switching to Build."
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
    workspaceGuard,
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
    /inspect app\/page\.tsx/
  );
  assert.deepEqual(
    (await chatHistory.listMessages("p1")).map((message) => message.agentMode),
    ["plan", "plan"]
  );
});

test("retries failing shell action stops after 2 failed rounds, surfacing an error event", async () => {
  const docker = createMemoryDockerEngine();
  let execAttempts = 0;
  docker.execInContainer = async () => {
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
  const reply =
    '<artifact id="a1" title="x"><action type="shell">npm run build</action></artifact>';
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([reply, reply, reply]),
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
    workspaceGuard,
    commitAllChanges: async () => "commit-sha-2"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build it" }));
  assert.match(events.find((event) => event.type === "error").message, /npm run build/);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(events.at(-1).type, "done");
  assert.equal(execAttempts, 3);
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
    workspaceGuard,
    readContextFiles: async () => {
      throw new Error("context reader should not be used");
    },
    readWorkspaceFiles: async (containerId) => [
      { path: "app/page.tsx", content: `// ${containerId}` }
    ],
    commitAllChanges: async () => "commit-sha-3"
  });

  assert.deepEqual(await service.listWorkspaceFiles("p1"), [
    { path: "app/page.tsx", content: "// container-1" }
  ]);
});
