import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function concurrencyFixture() {
  const started = [];
  const releases = new Map();
  const service = createGenerationService({
    llmClient: {
      async *streamChat(input) {
        const prompt = input.messages.at(-1).content;
        started.push(prompt);
        const release = deferred();
        releases.set(prompt, release);
        await release.promise;
        yield `done:${prompt}`;
      }
    },
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: { runAction: async () => ({ ok: true, stdout: "" }) },
    errorFeedback: createErrorFeedbackTracker(),
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    getApiKey: () => "sk-fake",
    getContainerId: (projectId) => `container-${projectId}`,
    workspaceGuard: {
      prepare: async () => "base",
      validate: async () => {},
      restore: async () => {}
    },
    commitAllChanges: async () => "sha"
  });
  return { service, started, releases };
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("condition did not become true");
}

test("generation turns for the same project execute one at a time", async () => {
  const { service, started, releases } = concurrencyFixture();
  const first = collect(service.runTurn({ projectId: "p1", prompt: "first", agentMode: "plan" }));
  await waitUntil(() => started.includes("first"));
  const second = collect(service.runTurn({ projectId: "p1", prompt: "second", agentMode: "plan" }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(started, ["first"]);
  releases.get("first").resolve();
  await first;
  await waitUntil(() => started.includes("second"));
  releases.get("second").resolve();
  await second;
});

test("generation turns for different projects proceed independently", async () => {
  const { service, started, releases } = concurrencyFixture();
  const first = collect(
    service.runTurn({ projectId: "p1", prompt: "project-one", agentMode: "plan" })
  );
  const second = collect(
    service.runTurn({ projectId: "p2", prompt: "project-two", agentMode: "plan" })
  );
  await waitUntil(() => started.length === 2);

  assert.deepEqual(new Set(started), new Set(["project-one", "project-two"]));
  releases.get("project-one").resolve();
  releases.get("project-two").resolve();
  await Promise.all([first, second]);
});
