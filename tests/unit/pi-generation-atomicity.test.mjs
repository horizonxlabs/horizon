import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}
function toolThenTextExecutor(name, args) {
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
              ? [{ type: "toolCall", id: "call-1", name, arguments: args }]
              : [{ type: "text", text: "Done" }],
          timestamp: round
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}
function transactionDeps(executor, lifecycle, mutationStates) {
  const memory = createMemoryChatHistoryStore();
  let changeChecks = 0;
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
    template: { name: "Web App", lockedFiles: [], files: [] },
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
        assert.ok(changeChecks < mutationStates.length, "unexpected Git status check");
        lifecycle.push("git:changes");
        return mutationStates[changeChecks++];
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot(_projectId, sha) {
        lifecycle.push(`restore:${sha}`);
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
    }
  };
}

test("failed Build restores the last good workspace and creates no checkpoint", async () => {
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
        const failure = {
          ok: false,
          error: "migration failed",
          stdout: "",
          stderr: "",
          exitCode: 1
        };
        return { ...failure, databaseMigrationOutcome: "not_applied" };
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
      async hasChanges(_projectId, snapshot) {
        assert.equal(snapshot, "base-sha");
        lifecycle.push("git:changes");
        return true;
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot(_projectId, sha) {
        lifecycle.push(`restore:${sha}`);
      },
      async releaseSnapshot() {}
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

  assert.deepEqual(lifecycle, [
    "prepare",
    "git:changes",
    "validate",
    "git:changes",
    "commit",
    "restore:base-sha"
  ]);
  assert.equal(checkpoints, 0);
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.commitSha, null);
});
test("Auto prepare failure persists an assistant error and terminates without restore", async () => {
  const lifecycle = [];
  const deps = transactionDeps(
    toolThenTextExecutor("read_workspace_file", { path: "x" }),
    lifecycle,
    []
  );
  deps.workspaceGuard.prepare = async () => {
    lifecycle.push("prepare:failed");
    throw new Error("baseline unavailable");
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Inspect and update", agentMode: "auto", actor })
  );

  assert.deepEqual(lifecycle, ["append:user", "prepare:failed", "append:assistant"]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["error", "done"]
  );
  assert.match((await service.history("p1")).at(-1).content, /baseline unavailable/);
});
test("a candidate file mutation repaired back to clean skips the commit", async () => {
  const lifecycle = [];
  const service = createPiGenerationService(
    transactionDeps(
      toolThenTextExecutor("write_workspace_file", { path: "app/page.tsx", content: "new" }),
      lifecycle,
      [true, false]
    )
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Try the update", agentMode: "auto", actor })
  );

  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "tool:file",
    "git:changes",
    "validate",
    "sync:migrations",
    "git:changes",
    "append:assistant"
  ]);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal((await service.history("p1")).at(-1).commitSha, null);
});

test("migration-only Auto materializes an artifact before commit and database migration", async () => {
  const lifecycle = [];
  const service = createPiGenerationService(
    transactionDeps(
      toolThenTextExecutor("propose_database_migration", {
        name: "001_create_items",
        sql: "CREATE TABLE items(id text PRIMARY KEY)"
      }),
      lifecycle,
      [false, true]
    )
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Add the items table", agentMode: "auto", actor })
  );

  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
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
    events.filter((event) => event.type === "commit"),
    [{ type: "commit", sha: "candidate-sha" }]
  );
});

test("migration-only Auto rejects missing and no-op artifact synchronization", async (t) => {
  for (const [name, configure, states, expected] of [
    [
      "missing sync",
      (deps) => delete deps.actionRunner.syncMigrationArtifacts,
      [false],
      /migration artifact sync is required/i
    ],
    ["no-op sync", () => undefined, [false, false], /migration artifact sync produced no changes/i]
  ]) {
    await t.test(name, async () => {
      const lifecycle = [];
      const deps = transactionDeps(
        toolThenTextExecutor("propose_database_migration", {
          name: "001_create_items",
          sql: "CREATE TABLE items(id text PRIMARY KEY)"
        }),
        lifecycle,
        states
      );
      configure(deps);
      const service = createPiGenerationService(deps);
      const events = await drain(
        service.runTurn({ projectId: "p1", prompt: "Add items", agentMode: "auto", actor })
      );

      assert.match(events.find((event) => event.type === "error")?.message ?? "", expected);
      assert.equal(lifecycle.includes("migrate:batch"), false);
      assert.equal(lifecycle.includes("restore:base-sha"), true);
      assert.equal(
        events.some((event) => event.type === "commit"),
        false
      );
    });
  }
});

test("cancellation during artifact sync rolls back before final Git status", async () => {
  const lifecycle = [];
  const controller = new AbortController();
  const deps = transactionDeps(
    toolThenTextExecutor("write_workspace_file", { path: "app/page.tsx", content: "new" }),
    lifecycle,
    [true]
  );
  deps.actionRunner.syncMigrationArtifacts = async () => {
    lifecycle.push("sync:migrations");
    controller.abort();
    return { ok: true, stdout: "" };
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Update the page",
      agentMode: "auto",
      actor,
      signal: controller.signal
    })
  );

  assert.deepEqual(lifecycle.slice(-3), [
    "sync:migrations",
    "restore:base-sha",
    "append:assistant"
  ]);
  assert.equal(lifecycle.includes("commit:candidate"), false);
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
});

test("cancellation during commit restores Git before irreversible finalization", async () => {
  const lifecycle = [];
  const controller = new AbortController();
  const deps = transactionDeps(
    toolThenTextExecutor("write_workspace_file", { path: "app/page.tsx", content: "new" }),
    lifecycle,
    [true, true]
  );
  deps.commitAllChanges = async () => {
    lifecycle.push("commit:candidate");
    controller.abort();
    return "candidate-sha";
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Update the page",
      agentMode: "auto",
      actor,
      signal: controller.signal
    })
  );

  assert.deepEqual(lifecycle.slice(-3), [
    "commit:candidate",
    "restore:base-sha",
    "append:assistant"
  ]);
  assert.equal(lifecycle.includes("migrate:batch"), false);
  assert.equal(lifecycle.includes("checkpoint"), false);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
});
