import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator
} from "../../apps/platform-api/src/project-lifecycle.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a generation turn whose child epoch expires cannot commit or persist final chat after deletion", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const writer = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const acquired = await writer.acquireChildMutationWithFence("p1");
  const finalCheckStarted = deferred();
  const resumeFinalCheck = deferred();
  const events = [];
  let round = 0;
  let checks = 0;
  const service = createPiGenerationService({
    governedAiExecutor: {
      async executeAgentRound(_actor, input) {
        round += 1;
        return {
          status: "succeeded",
          message: { role: "assistant", content: round === 1
            ? [{ type: "toolCall", id: "call-1", name: "write_workspace_file", arguments: { path: "app/page.tsx", content: "ok" } }]
            : [{ type: "text", text: "Done" }], timestamp: round },
          usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: {
      async runAction() { return { ok: true, stdout: "" }; },
      async syncMigrationArtifacts() { return { ok: true, stdout: "" }; },
      async runMigrationBatch() { events.push("migration"); return { ok: true, databaseMigrationOutcome: "not_applied" }; }
    },
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    workspaceGuard: {
      async prepare() { return "snapshot"; },
      async hasChanges() {
        checks += 1;
        if (checks === 2) { finalCheckStarted.resolve(); await resumeFinalCheck.promise; }
        return true;
      },
      async validate() {}, async restore() {}, async restoreSnapshot() {}, async releaseSnapshot() {}
    },
    async commitAllChanges() { events.push("commit"); return "candidate"; },
    checkpoints: { async createCheckpoint() { events.push("checkpoint"); } }
  });
  const turn = (async () => {
    try {
      for await (const event of service.runTurn({
        projectId: "p1", prompt: "Build", actor, assertCurrent: acquired.fence.assertCurrent
      })) events.push(event.type);
    } finally {
      acquired.release();
    }
  })();
  await finalCheckStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("p1", async () => undefined);
  resumeFinalCheck.resolve();
  await turn;

  assert.equal(events.includes("commit"), false);
  assert.equal(events.includes("checkpoint"), false);
  assert.equal(events.includes("migration"), false);
  assert.equal((await service.history("p1")).some((message) => message.role === "assistant"), false);
});
