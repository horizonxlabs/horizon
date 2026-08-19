import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
const snapshotToken = "snapshot-token";

async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function textExecutor(text = "Done") {
  return {
    async executeAgentRound(_actor, input) {
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          timestamp: 1
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

function writeThenExecutor(finalStatus = "succeeded") {
  let round = 0;
  return {
    async executeAgentRound(_actor, input) {
      round += 1;
      if (round === 2 && finalStatus === "failed") {
        return {
          status: "failed",
          evidence: { requestId: input.requestId, failureReason: "model failed after mutation" }
        };
      }
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content:
            round === 1
              ? [
                  {
                    type: "toolCall",
                    id: "call-write",
                    name: "write_workspace_file",
                    arguments: { path: "app/page.tsx", content: "model output" }
                  }
                ]
              : [{ type: "text", text: "Done" }],
          timestamp: round
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

function migrationThenTextExecutor() {
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
              ? [
                  {
                    type: "toolCall",
                    id: "call-migration",
                    name: "propose_database_migration",
                    arguments: {
                      name: "001_create_items",
                      sql: "CREATE TABLE items(id text PRIMARY KEY)"
                    }
                  }
                ]
              : [{ type: "text", text: "Done" }],
          timestamp: round
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

function transactionDeps(executor, lifecycle, mutationStates, state, history = undefined) {
  const memory = history ?? createMemoryChatHistoryStore();
  let changeCheck = 0;
  return {
    governedAiExecutor: executor,
    chatHistory: memory,
    actionRunner: {
      async runAction() {
        lifecycle.push("tool:file");
        state.repair = "model output";
        state.modelFile = true;
        return { ok: true, stdout: "" };
      },
      async syncMigrationArtifacts() {
        lifecycle.push("sync:migrations");
        return { ok: true, stdout: "" };
      },
      async runMigrationBatch(input) {
        assert.equal(input.actions.length > 0 || mutationStates[0] === true, true);
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
        lifecycle.push("git:snapshot");
        return snapshotToken;
      },
      async hasChanges(_projectId, baseline) {
        assert.equal(baseline, snapshotToken);
        assert.ok(changeCheck < mutationStates.length, "unexpected comparison");
        lifecycle.push(`git:changes:${baseline}`);
        return mutationStates[changeCheck++];
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot(_projectId, baseline) {
        assert.equal(baseline, snapshotToken);
        lifecycle.push(`restore:${baseline}`);
        state.head = "original-head";
        state.repair = "pre-turn repair";
        state.modelFile = false;
      },
      async releaseSnapshot(_projectId, baseline) {
        assert.equal(baseline, snapshotToken);
        lifecycle.push(`release:${baseline}`);
      }
    },
    async commitAllChanges() {
      lifecycle.push("commit:candidate");
      state.head = "candidate-sha";
      return "candidate-sha";
    },
    checkpoints: {
      async createCheckpoint() {
        lifecycle.push("checkpoint");
      }
    }
  };
}

test("informational Auto treats a dirty pre-turn repair baseline as clean", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const service = createPiGenerationService(
    transactionDeps(textExecutor("Uses local data."), lifecycle, [false], state)
  );

  const events = await drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Where is the data from?",
      agentMode: "auto",
      actor
    })
  );

  assert.deepEqual(lifecycle, [
    "git:snapshot",
    `git:changes:${snapshotToken}`,
    `release:${snapshotToken}`
  ]);
  assert.deepEqual(state, { head: "original-head", repair: "pre-turn repair", modelFile: false });
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal((await service.history("p1")).at(-1).commitSha, null);
});

test("failed Auto restores the exact dirty snapshot and original HEAD", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const service = createPiGenerationService(
    transactionDeps(writeThenExecutor("failed"), lifecycle, [], state)
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Try a change", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), true);
  assert.deepEqual(state, { head: "original-head", repair: "pre-turn repair", modelFile: false });
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["error", "done"]
  );
});

test("ignored-only mutation fails clearly and restores the turn snapshot", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const deps = transactionDeps(writeThenExecutor(), lifecycle, [true, true], state);
  deps.commitAllChanges = async () => {
    lifecycle.push("commit:rejected");
    throw new Error(
      "workspace has no Git-visible changes; ignored-only changes cannot be committed"
    );
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Write cache output", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes("commit:rejected"), true);
  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), true);
  assert.deepEqual(state, { head: "original-head", repair: "pre-turn repair", modelFile: false });
  assert.match(events.find((event) => event.type === "error").message, /ignored-only/i);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
});

test("checkpoint failure preserves durable candidate Git and emits truthful commit evidence", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const deps = transactionDeps(migrationThenTextExecutor(), lifecycle, [false, true], state);
  deps.checkpoints.createCheckpoint = async () => {
    lifecycle.push("checkpoint:persisted");
    throw new Error("checkpoint response lost");
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Update page", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), false);
  assert.equal(state.head, "candidate-sha");
  assert.deepEqual(
    events.slice(-3).map((event) => event.type),
    ["commit", "error", "done"]
  );
  assert.equal(events.filter((event) => event.type === "commit").length, 1);
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.commitSha, "candidate-sha");
  assert.match(assistant.content, /checkpoint response lost/);
});

test("evidence-store failure after migration SQL preserves candidate Git and commit evidence", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const deps = transactionDeps(migrationThenTextExecutor(), lifecycle, [false, true], state);
  deps.actionRunner.runMigrationBatch = async () => {
    lifecycle.push("migrate:sql-applied");
    return {
      ok: false,
      error: "migration failed: evidence acknowledgement lost",
      stdout: "",
      stderr: "evidence acknowledgement lost",
      exitCode: 1,
      databaseMigrationOutcome: "applied"
    };
  };
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Add items", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), false);
  assert.equal(state.head, "candidate-sha");
  assert.deepEqual(
    events.slice(-3).map((event) => event.type),
    ["commit", "error", "done"]
  );
  const assistant = (await service.history("p1")).at(-1);
  assert.equal(assistant.commitSha, "candidate-sha");
  assert.match(assistant.content, /evidence acknowledgement lost/);
});

test("lost SQL acknowledgement preserves candidate Git conservatively", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const deps = transactionDeps(migrationThenTextExecutor(), lifecycle, [false, true], state);
  deps.actionRunner.runMigrationBatch = async () => ({
    ok: false,
    error: "migration failed: SQL acknowledgement lost",
    stdout: "",
    stderr: "SQL acknowledgement lost",
    exitCode: 1,
    databaseMigrationOutcome: "may_have_applied"
  });
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Add items", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), false);
  assert.equal(state.head, "candidate-sha");
  assert.deepEqual(
    events.slice(-3).map((event) => event.type),
    ["commit", "error", "done"]
  );
});

test("assistant persistence failure after finalization does not duplicate or hide commit evidence", async () => {
  const lifecycle = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const memory = createMemoryChatHistoryStore();
  let failedAssistantAppend = false;
  const history = {
    ...memory,
    async appendMessage(message) {
      await memory.appendMessage(message);
      if (message.role === "assistant" && !failedAssistantAppend) {
        failedAssistantAppend = true;
        throw new Error("history acknowledgement lost");
      }
    }
  };
  const service = createPiGenerationService(
    transactionDeps(migrationThenTextExecutor(), lifecycle, [false, true], state, history)
  );

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Update page", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore:${snapshotToken}`), false);
  assert.equal(state.head, "candidate-sha");
  assert.deepEqual(
    events.slice(-3).map((event) => event.type),
    ["commit", "error", "done"]
  );
  assert.equal(events.filter((event) => event.type === "commit").length, 1);
  const assistants = (await service.history("p1")).filter(
    (message) => message.role === "assistant"
  );
  assert.equal(assistants.length, 1);
  assert.equal(assistants[0].commitSha, "candidate-sha");
  assert.match(assistants[0].content, /history acknowledgement lost/);
});

test("snapshot release failure is audited without hiding the terminal done event", async () => {
  const lifecycle = [];
  const audits = [];
  const state = { head: "original-head", repair: "pre-turn repair", modelFile: false };
  const deps = transactionDeps(textExecutor(), lifecycle, [false], state);
  deps.workspaceGuard.releaseSnapshot = async () => {
    throw new Error("release failed with DATABASE_URL=postgresql://secret");
  };
  deps.onAudit = (event) => audits.push(event);
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Inspect app", agentMode: "auto", actor })
  );

  assert.equal(events.at(-1).type, "done");
  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal(audits.at(-1).action, "workspace_snapshot_release");
  assert.equal(audits.at(-1).metadata.ok, false);
  assert.match(audits.at(-1).metadata.error, /redacted-secret/);
  assert.doesNotMatch(audits.at(-1).metadata.error, /postgresql:\/\/secret/);
});
