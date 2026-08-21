import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptPiEvent,
  assistantTextDelta
} from "../../apps/platform-api/src/generation-loop/pi-event-adapter.ts";

test("maps Pi text and thinking deltas only to Creator stream deltas", () => {
  const text = {
    type: "message_update",
    message: { role: "assistant" },
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello" }
  };
  const thinking = {
    type: "message_update",
    message: { role: "assistant" },
    assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Inspecting" }
  };
  assert.deepEqual(adaptPiEvent(text), [{ type: "token", content: "Hello" }]);
  assert.deepEqual(adaptPiEvent(thinking), [{ type: "reasoning", content: "Inspecting" }]);
  assert.equal(assistantTextDelta(text), "Hello");
  assert.equal(assistantTextDelta(thinking), undefined);
});

test("maps native tool lifecycle with stable Pi call IDs", () => {
  assert.deepEqual(
    adaptPiEvent({
      type: "tool_execution_start",
      toolCallId: "call-7",
      toolName: "edit_workspace_file",
      args: { path: "app/page.tsx" }
    }),
    [
      {
        type: "action_start",
        actionId: "call-7",
        actionType: "edit",
        label: "app/page.tsx"
      }
    ]
  );
  assert.deepEqual(
    adaptPiEvent({
      type: "tool_execution_update",
      toolCallId: "call-7",
      toolName: "edit_workspace_file",
      args: { path: "app/page.tsx" },
      partialResult: { content: [{ type: "text", text: "checking" }] }
    }),
    [{ type: "action_chunk", actionId: "call-7", content: "checking" }]
  );
  assert.deepEqual(
    adaptPiEvent({
      type: "tool_execution_end",
      toolCallId: "call-7",
      toolName: "edit_workspace_file",
      result: {
        details: {
          actionId: "call-7",
          actionType: "edit",
          label: "app/page.tsx",
          ok: true,
          find: "Old",
          replace: "New"
        }
      },
      isError: false
    }),
    [
      {
        type: "action_result",
        actionId: "call-7",
        actionType: "edit",
        label: "app/page.tsx",
        ok: true,
        find: "Old",
        replace: "New"
      }
    ]
  );
});

test("maps all Horizon tools and sanitized failures", () => {
  const expected = {
    read_workspace_file: "read",
    list_workspace_files: "list",
    write_workspace_file: "file",
    edit_workspace_file: "edit",
    run_workspace_command: "shell",
    propose_database_migration: "migration",
    load_governed_skill: "skill"
  };
  for (const [toolName, actionType] of Object.entries(expected)) {
    const [event] = adaptPiEvent({
      type: "tool_execution_start",
      toolCallId: `call-${toolName}`,
      toolName,
      args: { name: "example", command: "pnpm" }
    });
    assert.equal(event.actionType, actionType);
  }
  assert.deepEqual(
    adaptPiEvent({
      type: "tool_execution_end",
      toolCallId: "call-bad",
      toolName: "run_workspace_command",
      result: {
        details: {
          actionId: "call-bad",
          actionType: "shell",
          label: "pnpm test",
          ok: false,
          error: "provider sk-secret failed"
        }
      },
      isError: true
    }),
    [
      {
        type: "action_result",
        actionId: "call-bad",
        actionType: "shell",
        label: "pnpm test",
        ok: false,
        error: "provider sk-[redacted] failed"
      }
    ]
  );
});

test("ignores Pi bookkeeping and surfaces terminal retry errors only", () => {
  assert.deepEqual(adaptPiEvent({ type: "agent_start" }), []);
  assert.deepEqual(adaptPiEvent({ type: "turn_start" }), []);
  assert.deepEqual(adaptPiEvent({ type: "agent_settled" }), []);
  assert.deepEqual(
    adaptPiEvent({ type: "auto_retry_end", success: false, finalError: "provider unavailable" }),
    [{ type: "error", message: "provider unavailable" }]
  );
});
