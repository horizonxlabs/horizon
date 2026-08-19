import assert from "node:assert/strict";

import { createMemoryChatHistoryStore } from "../../../apps/platform-api/src/generation-loop/chat-history-store.ts";

export const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
export const template = { name: "Web App", lockedFiles: ["package.json"], files: [] };

export async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

export function baseDeps(executor, lifecycle, hasWorkspaceChanges) {
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
      async prepare(_projectId, containerId) {
        assert.equal(containerId, "container-1");
        lifecycle.push("prepare:base");
        return "base-sha";
      },
      async hasChanges(_projectId, containerId, snapshot) {
        assert.equal(containerId, "container-1");
        assert.equal(snapshot, "base-sha");
        assert.equal(typeof hasWorkspaceChanges, "boolean", "fixture must declare mutation state");
        lifecycle.push("git:changes");
        return hasWorkspaceChanges;
      },
      async validate(_projectId, containerId) {
        assert.equal(containerId, "container-1");
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot(_projectId, containerId, commitSha) {
        assert.equal(containerId, "container-1");
        lifecycle.push(`restore:${commitSha}`);
      },
      async releaseSnapshot(_projectId, containerId) {
        assert.equal(containerId, "container-1");
      }
    },
    async commitAllChanges(_projectId, containerId) {
      assert.equal(containerId, "container-1");
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
