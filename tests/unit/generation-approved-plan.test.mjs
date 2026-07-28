import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };
const workspaceGuard = { prepare: async () => "sha", validate: async () => {}, restore: async () => {} };

function serviceWith(captured) {
  return createGenerationService({
    llmClient: {
      streamChat(input) {
        captured.prompts.push(input.systemPrompt);
        return (async function* () { yield "Done."; })();
      }
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "container-1",
    workspaceGuard,
    readContextFiles: async () => [{ path: "app/page.tsx", content: "export default function Home(){ return null; }" }],
    commitAllChanges: async () => "commit-sha"
  });
}

async function drain(iterable) { for await (const _ of iterable) { /* consume */ } }

test("a build turn with approvedPlan injects the Approved plan section", async () => {
  const captured = { prompts: [] };
  await drain(serviceWith(captured).runTurn({
    projectId: "p1", prompt: "do it", agentMode: "build", approvedPlan: "Step 1: add a Header."
  }));
  assert.ok(captured.prompts.some((p) => p.includes("## Approved plan") && p.includes("Step 1: add a Header.")));
});

test("a plan-mode turn ignores approvedPlan (no Approved plan section)", async () => {
  const captured = { prompts: [] };
  await drain(serviceWith(captured).runTurn({
    projectId: "p1", prompt: "plan it", agentMode: "plan", approvedPlan: "Step 1: add a Header."
  }));
  assert.ok(captured.prompts.every((p) => !p.includes("## Approved plan")));
});
