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

function baseDeps(executor, lifecycle, hasWorkspaceChanges) {
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
      async hasChanges(_projectId, _containerId, snapshot) {
        assert.equal(snapshot, "base-sha");
        assert.equal(typeof hasWorkspaceChanges, "boolean", "fixture must declare mutation state");
        lifecycle.push("git:changes");
        return hasWorkspaceChanges;
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot() {
        lifecycle.push("restore");
      },
      async releaseSnapshot() {}
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

function textExecutor(text) {
  return {
    async executeAgentRound(_actor, input) {
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          timestamp: 2
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
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
  const service = createPiGenerationService(baseDeps(executor, lifecycle, false));
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

test("Auto informational turn skips mutation lifecycle when Git stays clean", async () => {
  const lifecycle = [];
  const service = createPiGenerationService(
    baseDeps(textExecutor("The chart uses local mock data."), lifecycle, false)
  );

  const events = await drain(
    service.runTurn({
      projectId: "p1",
      prompt: "ตอนนี้ดึงข้อมูลมาจากไหน",
      agentMode: "auto",
      actor
    })
  );

  assert.deepEqual(lifecycle, ["append:user", "prepare:base", "git:changes", "append:assistant"]);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.content, "The chart uses local mock data.");
  assert.equal(assistant.commitSha, null);
});

test("Auto mutation runs the full transaction lifecycle exactly once", async () => {
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
                  id: "call-auto-write",
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
  const service = createPiGenerationService(baseDeps(executor, lifecycle, true));

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Create a dashboard", agentMode: "auto", actor })
  );

  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "tool:file",
    "git:changes",
    "validate",
    "sync:migrations",
    "git:changes",
    "commit:candidate",
    "migrate:batch",
    "checkpoint",
    "append:assistant"
  ]);
  const commitEvents = events.filter((event) => event.type === "commit");
  assert.deepEqual(commitEvents, [{ type: "commit", sha: "candidate-sha" }]);
  assert.equal((await service.history("p1")).at(-1).commitSha, "candidate-sha");
});

test("explicit Build skips empty commits when Git stays clean", async () => {
  const lifecycle = [];
  const service = createPiGenerationService(
    baseDeps(textExecutor("No workspace changes were needed."), lifecycle, false)
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Check the dashboard", agentMode: "build", actor })
  );

  assert.deepEqual(lifecycle, ["append:user", "prepare:base", "git:changes", "append:assistant"]);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal((await service.history("p1")).at(-1).commitSha, null);
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
  const service = createPiGenerationService(baseDeps(executor, lifecycle, true));
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.equal(events.find((event) => event.type === "error")?.message, undefined);
  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "tool:file",
    "git:changes",
    "validate",
    "sync:migrations",
    "git:changes",
    "commit:candidate",
    "migrate:batch",
    "checkpoint",
    "append:assistant"
  ]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["action_start", "action_result", "token", "commit", "done"]
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.content, "Built dashboard");
  assert.deepEqual(assistant.artifactActionIds, ["call-write"]);
  assert.equal(assistant.actions[0].type, "file");
  assert.equal(assistant.commitSha, "candidate-sha");
  assert.deepEqual(assistant.tokenUsage, { promptTokens: 20, completionTokens: 10 });
  assert.deepEqual(assistant.parts, [
    {
      id: "call-write",
      type: "tool",
      sequence: 1,
      tool: {
        actionType: "file",
        label: "app/page.tsx",
        status: "done",
        result: "export default function Page(){}"
      }
    },
    { id: "text-2", type: "text", sequence: 2, text: "Built dashboard" },
    { id: "commit-3", type: "commit", sequence: 3, sha: "candidate-sha" }
  ]);
  assert.equal(JSON.stringify(assistant).includes("sk-"), false);
});

test("failed turns persist the display-safe parts collected before the error", async () => {
  const lifecycle = [];
  const deps = baseDeps(textExecutor("Draft summary"), lifecycle, true);
  deps.limits.validationRetries = 0;
  deps.workspaceGuard.validate = async () => {
    lifecycle.push("validate");
    throw new Error("validation blocked");
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.equal(events.at(-2)?.type, "error");
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.parts?.[0]?.type, "text");
  assert.equal(assistant.parts?.[0]?.type === "text" && assistant.parts[0].text, "Draft summary");
  const errorPart = assistant.parts?.at(-1);
  assert.equal(errorPart?.type, "error");
  if (errorPart?.type === "error") {
    assert.equal(errorPart.sequence, assistant.parts?.length);
    assert.equal(errorPart.message, "validation blocked");
  }
});

test("validation feedback self-heals on the same Pi session before commit", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  let validations = 0;
  const executor = {
    async executeAgentRound(_actor, input, onEvent) {
      modelRounds += 1;
      const text = modelRounds === 1 ? "Initial build" : "Fixed build";
      onEvent({ type: "text_delta", delta: text });
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          timestamp: modelRounds
        },
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const deps = baseDeps(executor, lifecycle, true);
  deps.workspaceGuard.validate = async () => {
    validations += 1;
    lifecycle.push("validate");
    if (validations === 1) throw new Error("TypeScript error");
  };
  const service = createPiGenerationService(deps);
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build and fix", agentMode: "build", actor })
  );

  assert.equal(modelRounds, 2);
  assert.equal(validations, 2);
  assert.equal(lifecycle.includes("restore"), false);
  assert.equal(
    events.some((event) => event.type === "commit"),
    true
  );
  const streamedText = events
    .filter((event) => event.type === "token")
    .map((event) => event.content)
    .join("");
  assert.equal(streamedText, "Initial buildFixed build");
  assert.equal((await service.history("p1")).at(-1).content, streamedText);
});

test("Pi turns are FIFO per project but independent across projects", async () => {
  const lifecycle = [];
  const starts = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const executor = {
    async executeAgentRound(_actor, input) {
      starts.push(input.projectId);
      if (input.projectId === "p1" && starts.filter((id) => id === "p1").length === 1) {
        await firstGate;
      }
      return {
        status: "succeeded",
        message: { role: "assistant", content: [{ type: "text", text: "done" }], timestamp: 2 },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle, false));
  const first = drain(
    service.runTurn({ projectId: "p1", prompt: "first", agentMode: "plan", actor })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = drain(
    service.runTurn({ projectId: "p1", prompt: "second", agentMode: "plan", actor })
  );
  const independent = drain(
    service.runTurn({ projectId: "p2", prompt: "other", agentMode: "plan", actor })
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(starts, ["p1", "p2"]);
  releaseFirst();
  await Promise.all([first, second, independent]);
  assert.deepEqual(starts, ["p1", "p2", "p1"]);
});
