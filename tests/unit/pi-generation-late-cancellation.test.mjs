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

function mutationExecutor(kind) {
  let round = 0;
  return {
    async executeAgentRound(_actor, input) {
      round += 1;
      const toolCall =
        kind === "migration"
          ? {
              type: "toolCall",
              id: "call-migration",
              name: "propose_database_migration",
              arguments: {
                name: "001_create_items",
                sql: "CREATE TABLE items(id text PRIMARY KEY)"
              }
            }
          : {
              type: "toolCall",
              id: "call-write",
              name: "write_workspace_file",
              arguments: { path: "app/page.tsx", content: "candidate" }
            };
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: round === 1 ? [toolCall] : [{ type: "text", text: "Done" }],
          timestamp: round
        },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

function lateCancellationFixture(kind, abortAt) {
  const controller = new AbortController();
  const lifecycle = [];
  const state = { head: "original-head" };
  const memory = createMemoryChatHistoryStore();
  let changeCheck = 0;
  const mutationStates = kind === "migration" ? [false, true] : [true, true];
  const deps = {
    governedAiExecutor: mutationExecutor(kind),
    chatHistory: {
      ...memory,
      async appendMessage(message) {
        await memory.appendMessage(message);
        lifecycle.push(`history:${message.role}`);
        if (message.role === "assistant" && abortAt === "history") controller.abort();
      }
    },
    actionRunner: {
      async runAction() {
        lifecycle.push("tool:file");
        return { ok: true, stdout: "" };
      },
      async syncMigrationArtifacts() {
        lifecycle.push("sync:migrations");
        return { ok: true, stdout: "" };
      },
      async runMigrationBatch(input) {
        lifecycle.push("migrate:batch");
        if (abortAt === "migration") controller.abort();
        return {
          ok: true,
          stdout: "",
          databaseMigrationOutcome: input.actions.length > 0 ? "applied" : "not_applied"
        };
      }
    },
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        lifecycle.push("prepare:snapshot-token");
        return "snapshot-token";
      },
      async hasChanges(_projectId, _containerId, snapshotToken) {
        assert.equal(snapshotToken, "snapshot-token");
        return mutationStates[changeCheck++];
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot() {
        lifecycle.push("restore:snapshot-token");
        state.head = "original-head";
      },
      async releaseSnapshot() {
        lifecycle.push("release:snapshot-token");
      }
    },
    async commitAllChanges() {
      lifecycle.push("commit:candidate");
      state.head = "candidate-sha";
      return "candidate-sha";
    },
    checkpoints:
      abortAt === "history"
        ? undefined
        : {
            async createCheckpoint() {
              lifecycle.push("checkpoint");
              if (abortAt === "checkpoint") controller.abort();
            }
          }
  };
  return { controller, lifecycle, state, memory, deps };
}

async function assertPreservedCancellation(kind, abortAt) {
  const fixture = lateCancellationFixture(kind, abortAt);
  const service = createPiGenerationService(fixture.deps);
  const events = await drain(
    service.runTurn({
      projectId: "p1",
      prompt: "Apply the candidate",
      agentMode: "auto",
      actor,
      signal: fixture.controller.signal
    })
  );

  assert.equal(fixture.state.head, "candidate-sha");
  assert.equal(fixture.lifecycle.includes("restore:snapshot-token"), false);
  assert.equal(fixture.lifecycle.includes("migrate:batch"), true);
  if (abortAt !== "history") assert.equal(fixture.lifecycle.includes("checkpoint"), true);
  assert.equal(fixture.lifecycle.includes("history:assistant"), true);
  assert.ok(
    fixture.lifecycle.indexOf("history:assistant") > fixture.lifecycle.indexOf("migrate:batch"),
    "assistant evidence must be finalized after migration even after cancellation"
  );
  if (abortAt === "migration") {
    assert.ok(
      fixture.lifecycle.indexOf("checkpoint") > fixture.lifecycle.indexOf("migrate:batch"),
      "late migration cancellation must not skip checkpoint finalization"
    );
  }
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
  assert.match(assistants[0].content, /aborted/i);
  assert.equal((assistants[0].content.match(/⚠️/g) ?? []).length, 1);
}

test("cancellation reported after applied migration preserves candidate evidence", async () => {
  await assertPreservedCancellation("migration", "migration");
});

test("cancellation reported after checkpoint invocation preserves candidate evidence", async () => {
  await assertPreservedCancellation("file", "checkpoint");
});

test("cancellation reported after assistant persistence updates one truthful message", async () => {
  await assertPreservedCancellation("file", "history");
});
