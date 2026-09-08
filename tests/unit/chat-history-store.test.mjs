import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";

test("appends messages in order and lists them per project", async () => {
  const store = createMemoryChatHistoryStore();
  await store.appendMessage({
    id: "m1",
    projectId: "p1",
    role: "user",
    content: "hi",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  await store.appendMessage({
    id: "m2",
    projectId: "p1",
    role: "assistant",
    content: "hello",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:01.000Z"
  });

  const messages = await store.listMessages("p1");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "hello");
  assert.equal((await store.listMessages("other-project")).length, 0);
  assert.deepEqual(
    (await store.listRecentMessages("p1", 1)).map(({ id }) => id),
    ["m2"]
  );
});

test("re-appending a message ID updates it in place without changing history order", async () => {
  const store = createMemoryChatHistoryStore();
  const message = (id, content, createdAt) => ({
    id,
    projectId: "p1",
    role: "assistant",
    content,
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt
  });
  await store.appendMessage(message("m1", "draft", "2026-01-01T00:00:00.000Z"));
  await store.appendMessage(message("m2", "second", "2026-01-01T00:00:01.000Z"));
  await store.appendMessage(message("m1", "updated", "2026-01-01T00:00:02.000Z"));

  const messages = await store.listMessages("p1");
  assert.deepEqual(
    messages.map(({ id, content }) => ({ id, content })),
    [
      { id: "m1", content: "updated" },
      { id: "m2", content: "second" }
    ]
  );
});

test("message IDs cannot cross project or role identities", async () => {
  const store = createMemoryChatHistoryStore();
  const base = {
    id: "shared-id",
    projectId: "p1",
    role: "assistant",
    content: "original",
    artifactActionIds: [],
    commitSha: null,
    tokenUsage: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  await store.appendMessage(base);

  await assert.rejects(
    () => store.appendMessage({ ...base, projectId: "p2" }),
    /message identity conflict/i
  );
  await assert.rejects(
    () => store.appendMessage({ ...base, role: "user" }),
    /message identity conflict/i
  );

  assert.deepEqual(
    (await store.listMessages("p1")).map(({ content }) => content),
    ["original"]
  );
  assert.equal((await store.listMessages("p2")).length, 0);
});

test("stores and retrieves a rolling summary per project, latest write wins", async () => {
  const store = createMemoryChatHistoryStore();
  assert.equal(await store.getSummary("p1"), null);

  await store.putSummary({ projectId: "p1", summary: "v1", updatedAt: "2026-01-01T00:00:00.000Z" });
  await store.putSummary({ projectId: "p1", summary: "v2", updatedAt: "2026-01-01T00:00:01.000Z" });

  assert.equal((await store.getSummary("p1")).summary, "v2");
});
