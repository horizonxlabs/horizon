import test from "node:test";
import assert from "node:assert/strict";

const { applyVibeEvent } =
  await import("../../apps/creator-web/src/features/workspace/vibe-stream.ts");

function baseMessage(overrides = {}) {
  return {
    id: "msg_1",
    role: "assistant",
    text: "",
    actions: [],
    ...overrides
  };
}

test("token: appends streamed content to the message text", () => {
  const message = baseMessage({ text: "Hello" });
  const result = applyVibeEvent(message, "token", { content: " world" });
  assert.equal(result.text, "Hello world");
  assert.deepEqual(result.actions, []);
});

test("token: is a no-op append when content is missing", () => {
  const message = baseMessage({ text: "Hello" });
  const result = applyVibeEvent(message, "token", {});
  assert.equal(result.text, "Hello");
});

test("action_start: appends a new running action for an unseen actionId", () => {
  const message = baseMessage();
  const result = applyVibeEvent(message, "action_start", {
    actionId: "a1",
    actionType: "edit",
    label: "Editing src/index.ts"
  });
  assert.deepEqual(result.actions, [
    { id: "a1", type: "edit", label: "Editing src/index.ts", status: "running" }
  ]);
});

test("action_start: defaults actionType to file when missing", () => {
  const message = baseMessage();
  const result = applyVibeEvent(message, "action_start", { actionId: "a1", label: "New file" });
  assert.equal(result.actions[0].type, "file");
});

test("action_start: is idempotent for an actionId that already exists", () => {
  const existing = [{ id: "a1", type: "edit", label: "Editing", status: "running" }];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_start", {
    actionId: "a1",
    actionType: "shell",
    label: "Different label"
  });
  assert.deepEqual(result.actions, existing);
});

test("action_result ok=true: upserts a done action with find/replace patch", () => {
  const existing = [{ id: "a1", type: "edit", label: "Editing", status: "running" }];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a1",
    actionType: "edit",
    label: "Editing",
    ok: true,
    find: "const x = 1;",
    replace: "const x = 2;"
  });
  assert.deepEqual(result.actions, [
    {
      id: "a1",
      type: "edit",
      label: "Editing",
      status: "done",
      find: "const x = 1;",
      replace: "const x = 2;",
      body: undefined,
      error: undefined
    }
  ]);
});

test("action_result ok=true: upserts a done action with a body patch (file write)", () => {
  const existing = [{ id: "a1", type: "file", label: "Creating", status: "running" }];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a1",
    actionType: "file",
    label: "Creating",
    ok: true,
    body: "export const x = 1;"
  });
  assert.equal(result.actions[0].status, "done");
  assert.equal(result.actions[0].body, "export const x = 1;");
  assert.equal(result.actions[0].find, undefined);
  assert.equal(result.actions[0].replace, undefined);
});

test("action_result ok=false: upserts a failed action with an error patch", () => {
  const existing = [{ id: "a1", type: "shell", label: "Running", status: "running" }];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a1",
    actionType: "shell",
    label: "Running",
    ok: false,
    error: "command failed"
  });
  assert.equal(result.actions[0].status, "failed");
  assert.equal(result.actions[0].error, "command failed");
});

test("action_result: treats a missing ok field as failed", () => {
  const existing = [{ id: "a1", type: "shell", label: "Running", status: "running" }];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a1",
    actionType: "shell",
    label: "Running"
  });
  assert.equal(result.actions[0].status, "failed");
});

test("action_result: appends a new action if the actionId was never started", () => {
  const message = baseMessage();
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a2",
    actionType: "migration",
    label: "Migrating",
    ok: true
  });
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].id, "a2");
  assert.equal(result.actions[0].status, "done");
});

test("action_result: does not disturb other existing actions", () => {
  const existing = [
    { id: "a1", type: "file", label: "Creating", status: "done" },
    { id: "a2", type: "edit", label: "Editing", status: "running" }
  ];
  const message = baseMessage({ actions: existing });
  const result = applyVibeEvent(message, "action_result", {
    actionId: "a2",
    actionType: "edit",
    label: "Editing",
    ok: true
  });
  assert.deepEqual(result.actions[0], existing[0]);
  assert.equal(result.actions[1].status, "done");
});

test("commit: sets commitSha from the sha field", () => {
  const message = baseMessage();
  const result = applyVibeEvent(message, "commit", { sha: "abc123def456" });
  assert.equal(result.commitSha, "abc123def456");
});

test("error: appends a warning-prefixed error message to text", () => {
  const message = baseMessage({ text: "Some progress" });
  const result = applyVibeEvent(message, "error", { message: "guardrail blocked" });
  assert.equal(result.text, "Some progress\n\n⚠️ guardrail blocked");
});

test("done: returns the message unchanged", () => {
  const message = baseMessage({ text: "Finished", commitSha: "abc123" });
  const result = applyVibeEvent(message, "done", {});
  assert.deepEqual(result, message);
});

test("unknown event type: returns the message unchanged (no-op)", () => {
  const message = baseMessage({ text: "unchanged" });
  const result = applyVibeEvent(message, "some_unknown_event", { anything: "goes" });
  assert.deepEqual(result, message);
});

test("does not mutate the input message object", () => {
  const message = baseMessage({ text: "Hello", actions: [] });
  const frozenActions = message.actions;
  applyVibeEvent(message, "token", { content: " world" });
  assert.equal(message.text, "Hello");
  assert.equal(message.actions, frozenActions);
});
