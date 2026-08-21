import test from "node:test";
import assert from "node:assert/strict";
import { reduceTurnPart } from "../../apps/platform-api/src/generation-loop/turn-parts.ts";

function isValidToolPart(part) {
  if (
    !part ||
    typeof part !== "object" ||
    typeof part.actionType !== "string" ||
    typeof part.label !== "string"
  ) {
    return false;
  }
  if (part.status === "pending" || part.status === "running") {
    return !("result" in part) && !("error" in part);
  }
  if (part.status === "done") {
    return !("error" in part) && (part.result === undefined || typeof part.result === "string");
  }
  if (part.status === "failed") {
    return typeof part.error === "string" && !("result" in part);
  }
  return false;
}

test("workspace turn parts define a serializable ordered projection", () => {
  const parts = [
    { id: "reasoning-1", type: "reasoning", sequence: 1, text: "Inspect the route" },
    { id: "text-1", type: "text", sequence: 2, text: "I will inspect the route." },
    {
      id: "tool-call-1",
      type: "tool",
      sequence: 3,
      tool: {
        actionType: "file",
        label: "apps/creator-web/src/app/routes.ts",
        status: "done",
        progress: "Reading file",
        result: "File loaded"
      }
    },
    { id: "commit-1", type: "commit", sequence: 4, sha: "abc1234" },
    { id: "error-1", type: "error", sequence: 5, message: "Nothing to commit" }
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(parts)), parts);
  assert.ok(isValidToolPart(parts[2].tool));
  assert.ok(
    isValidToolPart({
      actionType: "shell",
      label: "pnpm test",
      status: "running",
      progress: "Testing"
    })
  );
  assert.ok(isValidToolPart({ actionType: "shell", label: "pnpm test", status: "done" }));
  assert.ok(
    isValidToolPart({ actionType: "shell", label: "pnpm test", status: "failed", error: "exit 1" })
  );
  assert.equal(
    isValidToolPart({
      actionType: "shell",
      label: "pnpm test",
      status: "failed",
      error: "exit 1",
      result: "partial"
    }),
    false
  );
  assert.equal(
    isValidToolPart({
      actionType: "shell",
      label: "pnpm test",
      status: "done",
      error: "unexpected"
    }),
    false
  );
  assert.equal(
    isValidToolPart({
      actionType: "shell",
      label: "pnpm test",
      status: "pending",
      result: "unexpected"
    }),
    false
  );
});

test("workspace chat messages keep parts optional for backward compatibility", () => {
  const legacyMessage = {
    id: "message-1",
    projectId: "project-1",
    role: "assistant",
    content: "Done"
  };
  assert.equal("parts" in legacyMessage, false);
});

test("reduceTurnPart preserves event order and replaces tool progress snapshots", () => {
  const afterReasoning = reduceTurnPart([], { type: "reasoning", content: "Inspecting" });
  const afterStart = reduceTurnPart(afterReasoning, {
    type: "action_start",
    actionId: "tool-1",
    actionType: "file",
    label: "Read route"
  });
  const afterUpdate = reduceTurnPart(afterStart, {
    type: "action_chunk",
    actionId: "tool-1",
    content: "40%"
  });
  const afterSecondUpdate = reduceTurnPart(afterUpdate, {
    type: "action_chunk",
    actionId: "tool-1",
    content: "80%"
  });
  const afterResult = reduceTurnPart(afterSecondUpdate, {
    type: "action_result",
    actionId: "tool-1",
    actionType: "file",
    label: "Read route",
    ok: true,
    body: "Route loaded"
  });
  const afterToken = reduceTurnPart(afterResult, { type: "token", content: "Done." });
  const afterCommit = reduceTurnPart(afterToken, { type: "commit", sha: "abc1234" });
  const afterError = reduceTurnPart(afterCommit, { type: "error", message: "Nothing else to do" });
  const afterDone = reduceTurnPart(afterError, { type: "done" });

  assert.deepEqual(afterDone, [
    { id: "reasoning-1", type: "reasoning", sequence: 1, text: "Inspecting" },
    {
      id: "tool-1",
      type: "tool",
      sequence: 2,
      tool: {
        actionType: "file",
        label: "Read route",
        status: "done",
        progress: "80%",
        result: "Route loaded"
      }
    },
    { id: "text-3", type: "text", sequence: 3, text: "Done." },
    { id: "commit-4", type: "commit", sequence: 4, sha: "abc1234" },
    { id: "error-5", type: "error", sequence: 5, message: "Nothing else to do" }
  ]);
  assert.equal(afterSecondUpdate.length, 2);
});

test("reduceTurnPart records failed actions without result fields", () => {
  const afterStart = reduceTurnPart([], {
    type: "action_start",
    actionId: "tool-1",
    actionType: "shell",
    label: "Run tests"
  });
  const parts = reduceTurnPart(afterStart, {
    type: "action_result",
    actionId: "tool-1",
    actionType: "shell",
    label: "Run tests",
    ok: false,
    body: "partial output",
    error: "exit 1"
  });

  assert.deepEqual(parts[0], {
    id: "tool-1",
    type: "tool",
    sequence: 1,
    tool: { actionType: "shell", label: "Run tests", status: "failed", error: "exit 1" }
  });
});
