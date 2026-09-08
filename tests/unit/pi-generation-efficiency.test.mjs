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

function executor(text = "Done") {
  return {
    async executeAgentRound(_actor, input) {
      return {
        status: "succeeded",
        message: { role: "assistant", content: [{ type: "text", text }], timestamp: 2 },
        usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
}

function depsFor(governedAiExecutor) {
  return {
    governedAiExecutor,
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: { async runAction() {} },
    template: { name: "Web App", lockedFiles: [], files: [] },
    getContainerId: () => "container-1",
    readContextFiles: async () => [],
    readWorkspaceFiles: async () => [],
    workspaceGuard: {
      async prepare() {
        return "base-sha";
      },
      async hasChanges() {
        return false;
      },
      async validate() {},
      async restore() {},
      async restoreSnapshot() {},
      async releaseSnapshot() {}
    },
    async commitAllChanges() {
      throw new Error("not expected");
    },
    limits: { maxModelRounds: 4, turnTimeoutMs: 30_000 }
  };
}

test("turn reads a relevance-ranked context pack from the complete workspace tree", async () => {
  let requestedPaths;
  let receivedSystemPrompt = "";
  const deps = depsFor({
    async executeAgentRound(_actor, input) {
      receivedSystemPrompt = input.systemPrompt;
      return executor("Inspected the report.").executeAgentRound(_actor, input);
    }
  });
  deps.listWorkspaceTree = async () => [
    "app/page.tsx",
    "app/layout.tsx",
    "app/reports/page.tsx",
    "components/ui/button.tsx"
  ];
  deps.readContextFiles = async (_containerId, paths) => {
    requestedPaths = paths;
    return paths.map((path) => ({ path, content: `// ${path}` }));
  };

  await drain(
    createPiGenerationService(deps).runTurn({
      projectId: "p1",
      prompt: "Inspect app/reports/page.tsx",
      agentMode: "plan",
      actor
    })
  );

  assert.equal(requestedPaths[0], "app/reports/page.tsx");
  assert.match(receivedSystemPrompt, /\/\/ app\/reports\/page\.tsx/);
});

test("turn refreshes the rolling handoff summary after assistant persistence", async () => {
  const deps = depsFor(executor("The dashboard is ready."));
  const persistedSummaries = [];
  const putSummary = deps.chatHistory.putSummary;
  deps.chatHistory.putSummary = async (summary) => {
    persistedSummaries.push(summary);
    await putSummary(summary);
  };

  await drain(
    createPiGenerationService(deps).runTurn({
      projectId: "p1",
      prompt: "Build a dashboard",
      agentMode: "plan",
      actor
    })
  );

  assert.match(persistedSummaries[0].summary, /User: Build a dashboard/);
  assert.match(persistedSummaries[0].summary, /Assistant: The dashboard is ready\./);
});

test("failed turn refreshes the handoff summary with the persisted failure", async () => {
  const deps = depsFor({
    async executeAgentRound() {
      throw new Error("provider unavailable");
    }
  });
  const persistedSummaries = [];
  const putSummary = deps.chatHistory.putSummary;
  deps.chatHistory.putSummary = async (summary) => {
    persistedSummaries.push(summary);
    await putSummary(summary);
  };

  await drain(
    createPiGenerationService(deps).runTurn({
      projectId: "p1",
      prompt: "Build it",
      agentMode: "plan",
      actor
    })
  );

  assert.match(persistedSummaries[0].summary, /provider unavailable/);
});

test("turn emits one privacy-safe Pi efficiency audit record", async () => {
  const audits = [];
  const deps = depsFor(executor());
  deps.onAudit = (event) => audits.push(event);

  await drain(
    createPiGenerationService(deps).runTurn({
      projectId: "p1",
      prompt: "Secret request",
      agentMode: "plan",
      actor
    })
  );

  const turnAudits = audits.filter((event) => event.action === "pi_turn");
  assert.deepEqual(turnAudits[0].metadata, {
    status: "succeeded",
    modelRounds: 1,
    toolCalls: 0,
    compactions: 0,
    promptTokens: 1,
    completionTokens: 1,
    contextFiles: 0,
    historyMessages: 0
  });
  assert.equal(JSON.stringify(turnAudits[0]).includes("Secret request"), false);
});

test("summary and audit sinks never change successful turn semantics", async () => {
  const deps = depsFor(executor());
  deps.chatHistory.putSummary = async () => {
    throw new Error("summary store unavailable");
  };
  deps.onAudit = () => {
    throw new Error("audit sink unavailable");
  };

  const events = await drain(
    createPiGenerationService(deps).runTurn({
      projectId: "p1",
      prompt: "Answer safely",
      agentMode: "plan",
      actor
    })
  );

  assert.equal(events.at(-1).type, "done");
  assert.equal((await deps.chatHistory.listMessages("p1")).at(-1).content, "Done");
});
