import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import {
  buildRollingSummary,
  refreshRollingSummary,
  selectRecentPiHistory
} from "../../apps/platform-api/src/generation-loop/pi-context-memory.ts";

function message(id, role, content) {
  return {
    id,
    projectId: "p1",
    role,
    content,
    artifactActionIds: [],
    commitSha: role === "assistant" ? `sha-${id}` : null,
    tokenUsage: null,
    createdAt: `2026-09-08T00:00:${id.padStart(2, "0")}.000Z`
  };
}

test("recent Pi history excludes system/current messages and begins at a user boundary", () => {
  const messages = [
    message("01", "system", "policy"),
    message("02", "user", "old request"),
    message("03", "assistant", "old answer"),
    message("04", "user", "middle request"),
    message("05", "assistant", "middle answer"),
    message("06", "user", "latest request"),
    message("07", "assistant", "latest answer"),
    message("08", "user", "current request")
  ];

  assert.deepEqual(
    selectRecentPiHistory(messages, "08", 3).map(({ id }) => id),
    ["06", "07"]
  );
});

test("rolling summary keeps recent outcomes within a hard character budget", () => {
  const summary = buildRollingSummary(
    [
      message("01", "user", "obsolete ".repeat(30)),
      message("02", "assistant", "obsolete result ".repeat(30)),
      message("03", "user", "latest request"),
      message("04", "assistant", "latest result")
    ],
    120
  );

  assert.ok(summary.length <= 120);
  assert.doesNotMatch(summary, /obsolete/);
  assert.match(summary, /latest request/);
  assert.match(summary, /latest result/);
});

test("refreshRollingSummary persists a deterministic project handoff", async () => {
  const store = createMemoryChatHistoryStore();
  await store.appendMessage(message("01", "user", "Build a dashboard"));
  await store.appendMessage(message("02", "assistant", "Dashboard built"));

  await refreshRollingSummary(store, "p1", {
    maxChars: 500,
    updatedAt: "2026-09-08T01:02:03.000Z"
  });

  assert.deepEqual(await store.getSummary("p1"), {
    projectId: "p1",
    summary: "User: Build a dashboard\nAssistant: Dashboard built (commit sha-02)",
    updatedAt: "2026-09-08T01:02:03.000Z"
  });
});
