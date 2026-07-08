import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";

test("appends messages in order and lists them per project", () => {
  const store = createMemoryChatHistoryStore();
  store.appendMessage({
    id: "m1",
    projectId: "p1",
    role: "user",
    content: "hi",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  store.appendMessage({
    id: "m2",
    projectId: "p1",
    role: "assistant",
    content: "hello",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:01.000Z"
  });

  const messages = store.listMessages("p1");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "hello");
  assert.equal(store.listMessages("other-project").length, 0);
});

test("stores and retrieves a rolling summary per project, latest write wins", () => {
  const store = createMemoryChatHistoryStore();
  assert.equal(store.getSummary("p1"), null);

  store.putSummary({ projectId: "p1", summary: "v1", updatedAt: "2026-01-01T00:00:00.000Z" });
  store.putSummary({ projectId: "p1", summary: "v2", updatedAt: "2026-01-01T00:00:01.000Z" });

  assert.equal(store.getSummary("p1").summary, "v2");
});
