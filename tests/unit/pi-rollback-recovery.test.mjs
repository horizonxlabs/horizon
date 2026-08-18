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

test("rollback failure retains the recovery snapshot and emits an operator warning", async () => {
  const lifecycle = [];
  const audits = [];
  const history = createMemoryChatHistoryStore();
  const service = createPiGenerationService({
    governedAiExecutor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "failed",
          evidence: { requestId: input.requestId, failureReason: "model unavailable" }
        };
      }
    },
    chatHistory: history,
    actionRunner: { async runAction() {} },
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        return snapshotToken;
      },
      async hasChanges() {
        throw new Error("not expected");
      },
      async validate() {},
      async restore() {},
      async restoreSnapshot(_projectId, _containerId, baseline) {
        lifecycle.push(`restore-failed:${baseline}`);
        throw new Error("archive extraction failed");
      },
      async releaseSnapshot(_projectId, _containerId, baseline) {
        lifecycle.push(`release:${baseline}`);
      }
    },
    async commitAllChanges() {
      throw new Error("not expected");
    },
    onAudit(event) {
      audits.push(event);
    }
  });

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Update page", agentMode: "auto", actor })
  );

  assert.equal(lifecycle.includes(`restore-failed:${snapshotToken}`), true);
  assert.equal(lifecycle.includes(`release:${snapshotToken}`), false);
  const error = events.find((event) => event.type === "error");
  assert.match(error?.message ?? "", /snapshot recovery is required/i);
  assert.match((await service.history("p1")).at(-1).content, /operator.*protected recovery/i);
  assert.deepEqual(audits.at(-1), {
    action: "workspace_snapshot_recovery_required",
    projectId: "p1",
    metadata: { ok: false, reason: "rollback_failed" }
  });
});
