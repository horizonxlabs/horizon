import test from "node:test";
import assert from "node:assert/strict";
import { mapChatHistoryToVibeMessages } from "../../apps/creator-web/src/features/workspace/chat-history.ts";

test("mapChatHistoryToVibeMessages: keeps only user/assistant turns", () => {
  const out = mapChatHistoryToVibeMessages([
    { id: "1", role: "user", content: "hi" },
    { id: "2", role: "system", content: "ignored" },
    { id: "3", role: "assistant", content: "hello" }
  ]);
  assert.deepEqual(
    out.map((m) => [m.id, m.role, m.text]),
    [
      ["1", "user", "hi"],
      ["3", "assistant", "hello"]
    ]
  );
});

test("mapChatHistoryToVibeMessages: maps actions and defaults status to done", () => {
  const [msg] = mapChatHistoryToVibeMessages([
    {
      id: "a",
      role: "assistant",
      content: "done",
      actions: [
        { id: "x", type: "file", label: "app/x.txt" },
        { id: "y", type: "file", label: "app/y.txt", ok: false }
      ],
      commitSha: "abc123"
    }
  ]);
  assert.equal(msg.commitSha, "abc123");
  assert.deepEqual(
    msg.actions.map((a) => [a.id, a.status]),
    [
      ["x", "done"],
      ["y", "failed"]
    ]
  );
});

test("mapChatHistoryToVibeMessages: tolerates missing actions and null commitSha", () => {
  const [msg] = mapChatHistoryToVibeMessages([
    { id: "a", role: "user", content: "hey", commitSha: null }
  ]);
  assert.deepEqual(msg.actions, []);
  assert.equal(msg.commitSha, undefined);
});
