import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptPiEvent,
  assistantTextDelta,
  collectToolExecutionEnd
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
  const [start] = adaptPiEvent({
    type: "tool_execution_start",
    toolCallId: "call-7",
    toolName: "edit_workspace_file",
    args: { path: "app/private.ts", find: "secret", replace: "replacement" }
  });
  assert.deepEqual(
    { ...start, startedAt: "timestamp" },
    {
      type: "action_start",
      actionId: "call-7",
      actionType: "edit",
      label: "Edit workspace file",
      inputSummary: "Edit workspace file requested",
      startedAt: "timestamp"
    }
  );
  assert.match(start.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(JSON.stringify(start), /private|secret|replacement/);

  const [update] = adaptPiEvent({
    type: "tool_execution_update",
    toolCallId: "call-7",
    toolName: "edit_workspace_file",
    args: { path: "app/private.ts" },
    partialResult: { content: [{ type: "text", text: "checking app/private.ts secret output" }] }
  });
  assert.deepEqual(update, {
    type: "action_chunk",
    actionId: "call-7",
    content: "Tool is running"
  });

  const [result] = adaptPiEvent({
    type: "tool_execution_end",
    toolCallId: "call-7",
    toolName: "edit_workspace_file",
    result: {
      details: {
        actionId: "call-7",
        actionType: "edit",
        label: "app/private.ts",
        ok: true,
        body: "full private source result",
        find: "secret",
        replace: "replacement"
      }
    },
    isError: false
  });
  assert.deepEqual(
    { ...result, endedAt: "timestamp" },
    {
      type: "action_result",
      actionId: "call-7",
      actionType: "edit",
      label: "Edit workspace file",
      ok: true,
      body: "Workspace file updated",
      endedAt: "timestamp"
    }
  );
  assert.match(result.endedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|replacement|source/);
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
  const [failure] = adaptPiEvent({
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
  });
  assert.deepEqual(
    { ...failure, endedAt: "timestamp" },
    {
      type: "action_result",
      actionId: "call-bad",
      actionType: "shell",
      label: "Run workspace command",
      ok: false,
      error: "Workspace command failed",
      endedAt: "timestamp"
    }
  );
  assert.doesNotMatch(JSON.stringify(failure), /pnpm|secret/);
});

test("keeps raw tool targets only in the in-memory write ledger", () => {
  const actionIds = [];
  const actions = [];
  const writtenPaths = new Set();
  collectToolExecutionEnd(
    {
      type: "tool_execution_end",
      toolCallId: "call-write",
      toolName: "write_workspace_file",
      result: {
        details: {
          actionId: "call-write",
          actionType: "file",
          label: "app/private.ts",
          ok: true
        }
      },
      isError: false
    },
    actionIds,
    actions,
    writtenPaths,
    undefined
  );

  assert.deepEqual(actionIds, ["call-write"]);
  assert.deepEqual(actions, [
    { id: "call-write", type: "file", label: "Write workspace file", ok: true }
  ]);
  assert.deepEqual([...writtenPaths], ["app/private.ts"]);
  assert.doesNotMatch(JSON.stringify(actions), /private/);
});

test("ignores malformed tool action types without crashing", () => {
  const malformedEnd = {
    type: "tool_execution_end",
    toolCallId: "call-malformed",
    toolName: "unknown_tool",
    result: {
      details: {
        actionId: "call-malformed",
        actionType: "not-an-action",
        label: "app/private.ts",
        ok: false
      }
    },
    isError: true
  };
  const actionIds = [];
  const actions = [];
  const writtenPaths = new Set();
  const priorFailure = { actionId: "prior", actionType: "shell", label: "prior", ok: false };

  assert.doesNotThrow(() => adaptPiEvent(malformedEnd));
  assert.deepEqual(adaptPiEvent(malformedEnd), []);
  assert.equal(
    collectToolExecutionEnd(malformedEnd, actionIds, actions, writtenPaths, priorFailure),
    priorFailure
  );
  assert.deepEqual(actionIds, []);
  assert.deepEqual(actions, []);
  assert.deepEqual([...writtenPaths], []);
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

test('generate_image tool events adapt to the "image" action type', () => {
  const start = adaptPiEvent({
    type: "tool_execution_start",
    toolCallId: "img-1",
    toolName: "generate_image",
    args: { path: "public/generated/hero.png" }
  });
  assert.equal(start.length, 1);
  assert.equal(start[0].type, "action_start");
  assert.equal(start[0].actionType, "image");
});

test('a successful generate_image end keeps ok:true — "image" must be in the valid actionTypes set', () => {
  const events = adaptPiEvent({
    type: "tool_execution_end",
    toolCallId: "img-1",
    toolName: "generate_image",
    isError: false,
    result: {
      content: [{ type: "text", text: "Generated public/generated/hero.png" }],
      details: {
        actionId: "img-1",
        actionType: "image",
        label: "public/generated/hero.png",
        ok: true,
        body: "prompt"
      }
    }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "action_result");
  assert.equal(events[0].ok, true);
});

test("a soft image failure remains visible but does not fail the generation turn", () => {
  const next = collectToolExecutionEnd(
    {
      type: "tool_execution_end",
      toolCallId: "call-image",
      toolName: "generate_image",
      result: {
        details: {
          actionId: "call-image",
          actionType: "image",
          label: "public/generated/hero.png",
          ok: false,
          softFailure: true,
          error: "image generation is not configured — continue without it"
        }
      },
      isError: false
    },
    [],
    [],
    new Set(),
    undefined
  );
  assert.equal(next, undefined);
});
