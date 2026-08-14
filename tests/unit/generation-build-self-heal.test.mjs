import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

async function collect(iterable) {
  const out = [];
  for await (const event of iterable) out.push(event);
  return out;
}

test("build-error self-heal: a failed build is fed back, fixed, and committed (no restore)", async () => {
  let validateCalls = 0;
  let committed = null;
  const lifecycle = [];

  // Self-heal applies to FOLLOW-UP builds; the first build compiles once at code-complete
  // instead (see first-build-compile.test.mjs). Seed a prior commit to make this a follow-up.
  const chatHistory = createMemoryChatHistoryStore();
  await chatHistory.appendMessage({
    id: "m0",
    projectId: "p1",
    role: "assistant",
    content: "built the base app",
    commitSha: "sha0"
  });

  const service = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([
      // Round 0 writes code whose build fails.
      '<artifact id="a1" title="build"><action type="file" filePath="app/page.tsx">export default function Home(){ return 1 }</action></artifact>',
      // Round 1 (after the <build_errors> feedback) corrects it.
      '<artifact id="a2" title="fix"><action type="edit" filePath="app/page.tsx">' +
        "<<<<<<< SEARCH\nexport default function Home(){ return 1 }\n=======\n" +
        "export default function Home() { return null; }\n>>>>>>> REPLACE</action></artifact>"
    ]),
    chatHistory,
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "c1",
    workspaceGuard: {
      prepare: async () => {
        lifecycle.push("prepare");
        return "good";
      },
      validate: async () => {
        validateCalls += 1;
        lifecycle.push("validate");
        if (validateCalls === 1) throw new Error("[31mx[0m Unterminated string constant");
      },
      restore: async () => {
        lifecycle.push("restore");
      }
    },
    commitAllChanges: async () => {
      committed = "sha1";
      lifecycle.push("commit");
      return "sha1";
    }
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build a page" }));

  // First build failed -> errors fed back -> second attempt passed -> committed, never restored.
  assert.ok(validateCalls >= 2, `expected >=2 validate calls, got ${validateCalls}`);
  assert.equal(committed, "sha1");
  assert.equal(lifecycle.includes("restore"), false);
  assert.ok(events.some((event) => event.type === "commit"));
});
