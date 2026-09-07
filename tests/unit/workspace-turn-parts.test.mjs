import test from "node:test";
import assert from "node:assert/strict";
import { reduceTurnPart } from "../../apps/platform-api/src/generation-loop/turn-parts.ts";

function isValidToolPart(part) {
  if (
    !part ||
    typeof part !== "object" ||
    typeof part.callId !== "string" ||
    typeof part.actionType !== "string" ||
    typeof part.label !== "string" ||
    typeof part.inputSummary !== "string" ||
    typeof part.startedAt !== "string"
  ) {
    return false;
  }
  if (part.status === "pending" || part.status === "running") {
    return !("result" in part) && !("error" in part);
  }
  if (part.status === "done") {
    return (
      typeof part.endedAt === "string" &&
      !("error" in part) &&
      (part.result === undefined || typeof part.result === "string")
    );
  }
  if (part.status === "failed") {
    return (
      typeof part.endedAt === "string" && typeof part.error === "string" && !("result" in part)
    );
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
        callId: "tool-call-1",
        actionType: "file",
        label: "Write workspace file",
        inputSummary: "Write workspace file requested",
        startedAt: "2026-08-22T10:00:00.000Z",
        endedAt: "2026-08-22T10:00:01.000Z",
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
      callId: "call-running",
      actionType: "shell",
      label: "Run workspace command",
      inputSummary: "Approved workspace command requested",
      startedAt: "2026-08-22T10:00:00.000Z",
      status: "running",
      progress: "Testing"
    })
  );
  assert.ok(
    isValidToolPart({
      callId: "call-done",
      actionType: "shell",
      label: "Run workspace command",
      inputSummary: "Approved workspace command requested",
      startedAt: "2026-08-22T10:00:00.000Z",
      endedAt: "2026-08-22T10:00:01.000Z",
      status: "done"
    })
  );
  assert.ok(
    isValidToolPart({
      callId: "call-failed",
      actionType: "shell",
      label: "Run workspace command",
      inputSummary: "Approved workspace command requested",
      startedAt: "2026-08-22T10:00:00.000Z",
      endedAt: "2026-08-22T10:00:01.000Z",
      status: "failed",
      error: "exit 1"
    })
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
    label: "Read route",
    inputSummary: "Write workspace file requested",
    startedAt: "2026-08-22T10:00:00.000Z"
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
    body: "Route loaded",
    endedAt: "2026-08-22T10:00:01.000Z"
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
        callId: "tool-1",
        actionType: "file",
        label: "Read route",
        inputSummary: "Write workspace file requested",
        startedAt: "2026-08-22T10:00:00.000Z",
        endedAt: "2026-08-22T10:00:01.000Z",
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
    label: "Run tests",
    inputSummary: "Run workspace command requested",
    startedAt: "2026-08-22T10:00:00.000Z"
  });
  const parts = reduceTurnPart(afterStart, {
    type: "action_result",
    actionId: "tool-1",
    actionType: "shell",
    label: "Run tests",
    ok: false,
    body: "partial output",
    error: "exit 1",
    endedAt: "2026-08-22T10:00:01.000Z"
  });

  assert.deepEqual(parts[0], {
    id: "tool-1",
    type: "tool",
    sequence: 1,
    tool: {
      callId: "tool-1",
      actionType: "shell",
      label: "Run tests",
      inputSummary: "Run workspace command requested",
      startedAt: "2026-08-22T10:00:00.000Z",
      endedAt: "2026-08-22T10:00:01.000Z",
      status: "failed",
      error: "exit 1"
    }
  });
});

test("reduceTurnPart preserves bounded edit before/after details for history", () => {
  const afterStart = reduceTurnPart([], {
    type: "action_start",
    actionId: "tool-edit",
    actionType: "edit",
    label: "app/page.tsx",
    inputSummary: "Edit app/page.tsx",
    startedAt: "2026-09-07T00:00:00.000Z"
  });
  const parts = reduceTurnPart(afterStart, {
    type: "action_result",
    actionId: "tool-edit",
    actionType: "edit",
    label: "app/page.tsx",
    ok: true,
    find: "before",
    replace: "after",
    endedAt: "2026-09-07T00:00:01.000Z"
  });

  assert.equal(parts[0].tool.label, "app/page.tsx");
  assert.equal(parts[0].tool.inputSummary, "Edit app/page.tsx");
  assert.equal(parts[0].tool.find, "before");
  assert.equal(parts[0].tool.replace, "after");
});

test("reduceTurnPart coalesces adjacent deltas into bounded durable content", () => {
  const afterFirstText = reduceTurnPart([], { type: "token", content: "Hello " });
  const afterSecondText = reduceTurnPart(afterFirstText, { type: "token", content: "world" });
  const afterReasoning = reduceTurnPart(afterSecondText, {
    type: "reasoning",
    content: "Inspecting "
  });
  const afterSecondReasoning = reduceTurnPart(afterReasoning, {
    type: "reasoning",
    content: "the route"
  });
  const afterTool = reduceTurnPart(afterSecondReasoning, {
    type: "action_start",
    actionId: "tool-1",
    actionType: "read",
    label: "app/private.ts",
    inputSummary: "Read workspace file requested",
    startedAt: "2026-08-22T10:00:00.000Z"
  });
  const afterLaterText = reduceTurnPart(afterTool, { type: "token", content: "Done." });
  const fullPart = reduceTurnPart([], { type: "token", content: "x".repeat(8_192) });
  const overflow = reduceTurnPart(fullPart, { type: "token", content: "tail" });
  const oversizedDelta = reduceTurnPart([], { type: "token", content: "y".repeat(9_000) });

  assert.deepEqual(
    afterLaterText.map((part) => [
      part.type,
      part.sequence,
      part.type === "text" || part.type === "reasoning" ? part.text : ""
    ]),
    [
      ["text", 1, "Hello world"],
      ["reasoning", 2, "Inspecting the route"],
      ["tool", 3, ""],
      ["text", 4, "Done."]
    ]
  );
  assert.deepEqual(
    overflow.map((part) => [part.id, part.sequence, part.text]),
    [
      ["text-1", 1, "x".repeat(8_192)],
      ["text-2", 2, "tail"]
    ]
  );
  assert.equal(overflow.map((part) => part.text).join(""), `${"x".repeat(8_192)}tail`);
  assert.equal(oversizedDelta.length, 2);
  assert.ok(oversizedDelta.every((part) => Buffer.byteLength(part.text, "utf8") <= 8_192));
  assert.equal(oversizedDelta.map((part) => part.text).join(""), "y".repeat(9_000));
});

test("reduceTurnPart bounds and redacts error and commit display data", () => {
  const errorParts = reduceTurnPart([], {
    type: "error",
    message: `DATABASE_URL=postgresql://user:password@db/private ${"x".repeat(2_000)}`
  });
  const withLongCommit = reduceTurnPart(errorParts, { type: "commit", sha: "a".repeat(200) });
  const withInvalidCommit = reduceTurnPart(withLongCommit, {
    type: "commit",
    sha: "sk-private-token"
  });

  assert.equal(errorParts[0].type, "error");
  if (errorParts[0].type === "error") {
    assert.ok(Buffer.byteLength(errorParts[0].message, "utf8") <= 1_024);
    assert.match(errorParts[0].message, /\[redacted-secret\]/);
    assert.doesNotMatch(errorParts[0].message, /password|private/);
  }
  assert.deepEqual(
    withInvalidCommit.map((part) => [
      part.type,
      part.sequence,
      part.type === "commit" ? part.sha : ""
    ]),
    [
      ["error", 1, ""],
      ["commit", 2, "a".repeat(64)],
      ["commit", 3, "unavailable"]
    ]
  );
});
