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

function passingWorkspaceGuard(overrides = {}) {
  return {
    prepare: async () => "base-sha",
    validate: async () => {},
    restore: async () => {},
    ...overrides
  };
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

  const checkpoints = createMemoryCheckpointStore();
  const lifecycle = [];
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
    workspaceGuard: passingWorkspaceGuard({
      prepare: async () => {
        lifecycle.push("prepare");
        return "base-sha";
      },
      validate: async () => {
        lifecycle.push("validate");
      },
      restore: async () => {
        lifecycle.push("restore");
      }
    }),
    commitAllChanges: async () => {
      lifecycle.push("commit");
      return "commit-sha-1";
    },
    checkpoints
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add home page" }));

  assert.ok(events.some((event) => event.type === "token"));
  const actionResult = events.find((event) => event.type === "action_result");
  assert.equal(actionResult.ok, true);
  const commit = events.find((event) => event.type === "commit");
  assert.equal(commit.sha, "commit-sha-1");
  assert.deepEqual(
    (await checkpoints.listCheckpoints("p1")).map(({ commitSha, tag, label }) => ({
      commitSha,
      tag,
      label
    })),
    [{ commitSha: "commit-sha-1", tag: "checkpoint/commit-sha-1", label: "add home page" }]
  );
  assert.equal(events.at(-1).type, "done");
  assert.deepEqual(lifecycle, ["prepare", "validate", "commit"]);
});

test("validation failure restores the starting revision and creates no commit or checkpoint", async () => {
  const checkpoints = createMemoryCheckpointStore();
  const lifecycle = [];
  let commitAttempts = 0;
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      '<artifact id="a1" title="broken"><action type="file" filePath="app/page.tsx">broken source</action></artifact>'
    ]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard: passingWorkspaceGuard({
      prepare: async () => {
        lifecycle.push("prepare");
        return "known-good";
      },
      validate: async () => {
        lifecycle.push("validate");
        throw new Error("build failed");
      },
      restore: async (_projectId, sha) => {
        lifecycle.push(`restore:${sha}`);
      }
    }),
    commitAllChanges: async () => {
      commitAttempts += 1;
      return "must-not-commit";
    },
    checkpoints
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "break it" }));

  // Build-error self-heal: the failed build is validated in the round loop AND re-checked by the
  // finalization gate before commit, so validate runs twice; the atomicity guarantee is unchanged —
  // it still ends in a restore to the known-good revision with no commit.
  assert.deepEqual(lifecycle, ["prepare", "validate", "validate", "restore:known-good"]);
  assert.equal(commitAttempts, 0);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.match(events.find((event) => event.type === "error").message, /build failed/);
  assert.deepEqual(await checkpoints.listCheckpoints("p1"), []);
});

test("migration runs only after validation and code commit and records the resulting commit SHA", async () => {
  const lifecycle = [];
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      '<artifact id="m1" title="schema"><action type="migration" filePath="add_users">CREATE TABLE users(id text);</action></artifact>'
    ]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: {
      runAction: async () => ({ ok: true, stdout: "" }),
      syncMigrationArtifacts: async ({ actions }) => {
        lifecycle.push(`sync:${actions.map((action) => action.name).join(",")}`);
        return { ok: true, stdout: "" };
      },
      runMigrationBatch: async ({ actions, commitSha }) => {
        lifecycle.push(`migration:${commitSha ?? "missing"}`);
        assert.deepEqual(
          actions.map((action) => action.type),
          ["migration"]
        );
        return { ok: true, stdout: "" };
      }
    },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard: passingWorkspaceGuard({
      prepare: async () => {
        lifecycle.push("prepare");
        return "base-sha";
      },
      validate: async () => {
        lifecycle.push("validate");
      },
      restore: async () => {
        lifecycle.push("restore");
      }
    }),
    commitAllChanges: async () => {
      lifecycle.push("commit");
      return "new-sha";
    }
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add users" }));

  assert.deepEqual(lifecycle, [
    "prepare",
    "sync:add_users",
    "validate",
    "commit",
    "migration:new-sha"
  ]);
  assert.equal(
    events.some((event) => event.type === "commit" && event.sha === "new-sha"),
    true
  );
});

test("unexpected action exception restores last-known-good and completes with an error event", async () => {
  let actions = 0;
  let restored = null;
  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      '<artifact id="a1" title="two edits"><action type="file" filePath="app/a.ts">ok</action><action type="file" filePath="app/b.ts">boom</action></artifact>',
      '<artifact id="a2" title="retry"><action type="file" filePath="app/b.ts">boom</action></artifact>',
      '<artifact id="a3" title="retry"><action type="file" filePath="app/b.ts">boom</action></artifact>'
    ]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: {
      runAction: async () => {
        actions += 1;
        if (actions > 1) throw new Error("docker exec disappeared");
        return { ok: true, stdout: "" };
      }
    },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard: passingWorkspaceGuard({
      restore: async (_projectId, sha) => {
        restored = sha;
      }
    }),
    commitAllChanges: async () => "must-not-commit"
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "edit both" }));

  assert.equal(restored, "base-sha");
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.match(events.find((event) => event.type === "error").message, /docker exec disappeared/);
  assert.equal(events.at(-1).type, "done");
});

test("governed completion owns workspace model calls and receives the authenticated actor", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-governed",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });
  let legacyCalls = 0;
  const governedCalls = [];
  const service = createGenerationService({
    llmClient: {
      async *streamChat() {
        legacyCalls += 1;
        yield "must not be used";
      }
    },
    governedCompletion: (input) => {
      governedCalls.push(input);
      // Streaming source: tagged chunks (reasoning is a separate channel; answer tokens carry code).
      return (async function* () {
        yield { kind: "reasoning", text: "I should add a page." };
        yield {
          kind: "token",
          text: 'Governed output\n<artifact id="a1" title="add page"><action type="file" filePath="app/page.tsx">'
        };
        yield { kind: "token", text: "export default function Home(){}</action></artifact>" };
      })();
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "must-not-reach-provider-directly",
    getContainerId: () => containerId,
    workspaceGuard: passingWorkspaceGuard(),
    commitAllChanges: async () => "commit-governed"
  });

  const events = await collect(
    service.runTurn({
      projectId: "p1",
      prompt: "add home page",
      actor: { id: "usr_creator", email: "creator@example.test", name: "Creator", role: "creator" }
    })
  );

  assert.equal(legacyCalls, 0);
  assert.equal(governedCalls.length, 1);
  assert.equal(governedCalls[0].scenario, "frontend_coding");
  assert.equal(governedCalls[0].actor.id, "usr_creator");
  assert.ok(events.some((event) => event.type === "action_result" && event.ok));
});

test("message ids are unique across service instances (survive a process restart)", async () => {
  // Regression: nextMessageId used to be an in-memory counter (msg-1, msg-2, …) that reset on every
  // restart and was shared across projects, so a fresh instance re-issued msg-1 and collided with a
  // persisted row. A new service instance must never reuse an id the shared store already holds.
  const chatHistory = createMemoryChatHistoryStore();
  const buildService = () =>
    createGenerationService({
      llmClient: createMemoryLlmCompletionClient(["Just talking."]),
      chatHistory,
      actionRunner: createActionRunner({
        docker: createMemoryDockerEngine(),
        checkpoints: createMemoryCheckpointStore(),
        migrations: createMemoryMigrationStore()
      }),
      errorFeedback: createErrorFeedbackTracker(),
      template,
      getApiKey: () => "sk-fake",
      getContainerId: () => undefined,
      workspaceGuard: passingWorkspaceGuard(),
      commitAllChanges: async () => "sha"
    });

  await collect(buildService().runTurn({ projectId: "p1", prompt: "hi", agentMode: "plan" }));
  // Second instance = simulated restart; the old counter would re-issue the same ids here.
  await collect(buildService().runTurn({ projectId: "p1", prompt: "again", agentMode: "plan" }));

  const ids = (await chatHistory.listMessages("p1")).map((message) => message.id);
  assert.equal(new Set(ids).size, ids.length, `message ids must be unique, got ${ids.join(", ")}`);
});

test("commit failure still persists the turn and surfaces an error event (no lost history)", async () => {
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
  const chatHistory = createMemoryChatHistoryStore();
  let restoredTo = null;
  const scriptedReply =
    'Adding it.\n<artifact id="a1" title="add page">' +
    '<action type="file" filePath="app/page.tsx">export default function Home(){}</action>' +
    "</artifact>";

  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply]),
    chatHistory,
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    workspaceGuard: passingWorkspaceGuard({
      restore: async (_projectId, sha) => {
        restoredTo = sha;
      }
    }),
    commitAllChanges: async () => {
      throw new Error("git commit failed (exit 128): detected dubious ownership in '/workspace'");
    }
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "add home page" }));

  // The commit throw must NOT abort the turn: an error event is surfaced, then done.
  const errorEvent = events.find((event) => event.type === "error");
  assert.match(errorEvent.message, /git commit failed \(exit 128\)/);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(events.at(-1).type, "done");
  assert.equal(restoredTo, "base-sha");
  // Crucially, the assistant turn is still saved so switching projects / refreshing keeps it.
  const saved = await chatHistory.listMessages("p1");
  assert.equal(
    saved.some((message) => message.role === "assistant"),
    true
  );
});
