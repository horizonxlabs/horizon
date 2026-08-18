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
      async hasChanges(_projectId, snapshot) {
        assert.equal(snapshot, "base-sha");
        assert.equal(typeof hasWorkspaceChanges, "boolean", "fixture must declare mutation state");
        lifecycle.push("git:changes");
        return hasWorkspaceChanges;
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot(_projectId, commitSha) {
        lifecycle.push(`restore:${commitSha}`);
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

test("a corrected tool retry clears the earlier failure and allows commit", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      modelRounds += 1;
      const message =
        modelRounds === 1
          ? {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: "call-write-existing",
                  name: "write_workspace_file",
                  arguments: { path: "app/page.tsx", content: "new page" }
                }
              ],
              timestamp: 1
            }
          : modelRounds === 2
            ? {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: "call-edit-existing",
                    name: "edit_workspace_file",
                    arguments: { path: "app/page.tsx", find: "old page", replace: "new page" }
                  }
                ],
                timestamp: 2
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: "Recovered and built" }],
                timestamp: 3
              };
      return {
        status: "succeeded",
        message,
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const deps = baseDeps(executor, lifecycle, true);
  deps.readWorkspaceFiles = async () => [{ path: "app/page.tsx", content: "old page" }];
  deps.actionRunner.runAction = async (input) => {
    lifecycle.push(`tool:${input.action.type}`);
    if (input.action.type === "file") {
      return {
        ok: false,
        error: "workspace file 'app/page.tsx' already exists; use edit_workspace_file"
      };
    }
    return { ok: true, stdout: "" };
  };

  const service = createPiGenerationService(deps);
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build notes", agentMode: "build", actor })
  );

  assert.equal(modelRounds, 3);
  assert.equal(
    events.some((event) => event.type === "commit"),
    true
  );
  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal((await service.history("p1")).at(-1).commitSha, "candidate-sha");
});

test("a successful build tool ends the Pi turn without asking a local model for another round", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      modelRounds += 1;
      if (modelRounds > 1) throw new Error("unexpected model round after successful validation");
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "The chart app is ready." },
            {
              type: "toolCall",
              id: "call-build",
              name: "run_workspace_command",
              arguments: { command: "npm", args: ["run", "build"] }
            }
          ],
          timestamp: 1
        },
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle, true));

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build a chart", agentMode: "build", actor })
  );

  assert.equal(modelRounds, 1);
  assert.equal(
    events.some((event) => event.type === "commit"),
    true
  );
  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.content, "The chart app is ready.");
  assert.equal(assistant.commitSha, "candidate-sha");
});

test("a successful terminal build clears an earlier failed build after the model repairs it", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  let buildAttempts = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      modelRounds += 1;
      const content =
        modelRounds === 1
          ? [
              {
                type: "toolCall",
                id: "call-build-failed",
                name: "run_workspace_command",
                arguments: { command: "npm", args: ["run", "build"] }
              }
            ]
          : modelRounds === 2
            ? [
                {
                  type: "toolCall",
                  id: "call-repair",
                  name: "edit_workspace_file",
                  arguments: {
                    path: "components/chart.tsx",
                    find: "time: number",
                    replace: "time: Time"
                  }
                }
              ]
            : [
                { type: "text", text: "The repaired chart now builds." },
                {
                  type: "toolCall",
                  id: "call-build-passed",
                  name: "run_workspace_command",
                  arguments: { command: "npm", args: ["run", "build"] }
                }
              ];
      return {
        status: "succeeded",
        message: { role: "assistant", content, timestamp: modelRounds },
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const deps = baseDeps(executor, lifecycle, true);
  deps.readWorkspaceFiles = async () => [
    { path: "components/chart.tsx", content: "const point: { time: number } = data;" }
  ];
  deps.actionRunner.runAction = async (input) => {
    lifecycle.push(`tool:${input.action.type}`);
    if (input.action.type === "shell") {
      buildAttempts += 1;
      if (buildAttempts === 1) return { ok: false, error: "Type error: time must be Time" };
    }
    return { ok: true, stdout: "" };
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Repair the chart", agentMode: "build", actor })
  );

  assert.equal(modelRounds, 3);
  assert.equal(buildAttempts, 2);
  assert.equal(
    events.some((event) => event.type === "commit"),
    true
  );
  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal((await service.history("p1")).at(-1).content, "The repaired chart now builds.");
});

test("cancelling a turn aborts the in-flight Pi model round", async () => {
  const lifecycle = [];
  const controller = new AbortController();
  let modelSignal;
  let releaseStarted;
  const started = new Promise((resolve) => {
    releaseStarted = resolve;
  });
  const executor = {
    async executeAgentRound(_actor, input) {
      modelSignal = input.signal;
      releaseStarted();
      await Promise.race([
        new Promise((resolve) => input.signal.addEventListener("abort", resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, 50))
      ]);
      return {
        status: "failed",
        evidence: { requestId: input.requestId, failureReason: "aborted" }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle, true));
  const running = drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Build until cancelled",
      agentMode: "build",
      actor,
      signal: controller.signal
    })
  );

  await started;
  controller.abort();
  const events = await running;

  assert.equal(modelSignal.aborted, true);
  assert.deepEqual(
    events.map((event) => event.type),
    ["error", "done"]
  );
  assert.equal((await service.history("p1")).at(-1).content, "");
});

test("server-side stream errors persist the same warning sent to the client", async () => {
  const lifecycle = [];
  const executor = {
    async executeAgentRound(_actor, input) {
      return {
        status: "failed",
        evidence: { requestId: input.requestId, failureReason: "model unavailable" }
      };
    }
  };
  const service = createPiGenerationService(baseDeps(executor, lifecycle, false));
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Plan", agentMode: "plan", actor })
  );
  const error = events.find((event) => event.type === "error");

  assert.ok(error, JSON.stringify(events));
  assert.equal(error.message, "model unavailable");
  assert.equal((await service.history("p1")).at(-1).content, `\n\n⚠️ ${error.message}`);
});

test("a failed build restores the prepared workspace instead of leaving broken files live", async () => {
  const lifecycle = [];
  const service = createPiGenerationService(
    baseDeps(
      {
        async executeAgentRound(_actor, input) {
          return {
            status: "failed",
            evidence: { requestId: input.requestId, failureReason: "model unavailable" }
          };
        }
      },
      lifecycle,
      true
    )
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.deepEqual(
    events.map((event) => event.type),
    ["error", "done"]
  );
  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "restore:base-sha",
    "append:assistant"
  ]);
});

test("the turn token budget stops a runaway Pi loop and restores the workspace", async () => {
  const lifecycle = [];
  let rounds = 0;
  const deps = baseDeps(
    {
      async executeAgentRound(_actor, input) {
        rounds += 1;
        const message =
          rounds === 1
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
                timestamp: 1
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: "Finished" }],
                timestamp: 2
              };
        return {
          status: "succeeded",
          message,
          usage: { input: 5, output: 1, totalTokens: 6, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    lifecycle,
    true
  );
  deps.limits.maxTurnTokens = 10;
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.equal(rounds, 2);
  assert.match(events.find((event) => event.type === "error")?.message ?? "", /token budget/i);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(lifecycle.includes("restore:base-sha"), true);
});
