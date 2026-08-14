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

function buildService(overrides) {
  const chatHistory = overrides.chatHistory ?? createMemoryChatHistoryStore();
  const state = { validateCalls: 0, committed: null, restored: false, prompts: [] };
  const inner = createMemoryLlmCompletionClient(overrides.replies);
  const service = createGenerationService({
    llmClient: {
      streamChat(input) {
        state.prompts.push(input.systemPrompt);
        return inner.streamChat(input);
      }
    },
    chatHistory,
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => "c1",
    workspaceGuard: {
      prepare: async () => "base",
      validate: async () => {
        state.validateCalls += 1;
        if (overrides.validate) overrides.validate(state.validateCalls);
      },
      restore: async () => {
        state.restored = true;
      }
    },
    commitAllChanges: async () => {
      state.committed = "sha1";
      return "sha1";
    }
  });
  return { service, chatHistory, state };
}

test("first build: no interim bug scans — one compile at code-complete, failure goes to the bug box, work still committed", async () => {
  const { service, state } = buildService({
    replies: [
      '<artifact id="a1" title="build"><action type="file" filePath="app/page.tsx">export default function Home(){ return 1 }</action></artifact>'
    ],
    validate: () => {
      throw new Error("Type error: cannot return 1");
    }
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build the app" }));

  // ONE compile after code-complete — no per-round write checks, no self-heal feedback rounds.
  assert.equal(state.validateCalls, 1);
  assert.equal(state.prompts.length, 1, "no feedback rounds on the first build");
  const compileError = events.find(
    (event) => event.type === "error" && event.message.startsWith("Compile check failed: ")
  );
  assert.ok(compileError, "compile failure surfaces with the bug-box prefix");
  // The work is kept AND committed — the user inspects it and presses Fix in the bug box.
  assert.equal(state.committed, "sha1");
  assert.equal(state.restored, false);
  assert.ok(events.some((event) => event.type === "commit"));
});

test("first build that compiles clean: single validate, commit, no error events", async () => {
  const { service, state } = buildService({
    replies: [
      '<artifact id="a1" title="build"><action type="file" filePath="app/page.tsx">export default function Home() { return null; }</action></artifact>'
    ]
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "build the app" }));

  assert.equal(state.validateCalls, 1);
  assert.equal(state.committed, "sha1");
  assert.ok(!events.some((event) => event.type === "error"));
});

test("inspect turn on a broken workspace: readable Compile check failed, work kept, no restore", async () => {
  // The CMMS case round 2: a shell-only turn on an already-broken workspace used to hit
  // the raw final-gate validate — ANSI garbage in chat + a pointless rollback.
  const chatHistory = createMemoryChatHistoryStore();
  await chatHistory.appendMessage({
    id: "m0",
    projectId: "p1",
    role: "assistant",
    content: "built the base app",
    commitSha: "sha0"
  });
  const { service, state } = buildService({
    chatHistory,
    replies: ["ขอดูไฟล์ก่อน (no artifact this turn)"],
    validate: () => {
      throw new Error(
        "workspace validation failed (exit 1): \u001B[33mLinting and checking validity of types\u001B[39m\r\nFailed to compile.\r\nType error: x is not assignable"
      );
    }
  });

  const events = await collect(service.runTurn({ projectId: "p1", prompt: "why is the page broken?" }));

  const error = events.find((event) => event.type === "error");
  assert.ok(error, "expected a compile error event");
  assert.ok(error.message.startsWith("Compile check failed: "), error.message);
  assert.ok(!error.message.includes("\u001B"), "no ANSI garbage in chat");
  assert.match(error.message, /Failed to compile/);
  assert.equal(state.committed, null, "nothing to commit on an inspect turn");
  assert.equal(state.restored, false, "pre-existing brokenness must not trigger a rollback");
});

test("retry rounds see a FRESH file tree including files written earlier in the turn", async () => {
  // Follow-up build (prior commit exists) so the self-heal feedback round still runs.
  const chatHistory = createMemoryChatHistoryStore();
  await chatHistory.appendMessage({
    id: "m0",
    projectId: "p1",
    role: "assistant",
    content: "built the base app",
    commitSha: "sha0"
  });
  const { service, state } = buildService({
    chatHistory,
    replies: [
      '<artifact id="a1" title="build"><action type="file" filePath="components/Card.tsx">export const Card = () => 1</action></artifact>',
      '<artifact id="a2" title="fix"><action type="edit" filePath="components/Card.tsx">' +
        "<<<<<<< SEARCH\nexport const Card = () => 1\n=======\nexport const Card = () => null;\n>>>>>>> REPLACE</action></artifact>"
    ],
    validate: (calls) => {
      if (calls === 1) throw new Error("Type error: number is not JSX");
    }
  });

  await collect(service.runTurn({ projectId: "p1", prompt: "add a card" }));

  assert.equal(state.prompts.length, 2, "expected a self-heal feedback round");
  assert.match(
    state.prompts[1],
    /components\/Card\.tsx/,
    "round 2's system prompt must list the file created in round 1 — a stale tree makes the model recreate existing files"
  );
});
