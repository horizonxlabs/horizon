import assert from "node:assert/strict";
import test from "node:test";

const vibeChat = await import("../../apps/creator-web/src/features/workspace/use-vibe-chat.ts");

test("Workspace stream events map to stable English outcome states", () => {
  const outcome = vibeChat.workspaceOutcomeForEvent;
  assert.equal(typeof outcome, "function");
  const cases = [
    [{ type: "start", current: "", assistantText: "" }, "Working"],
    [{ type: "action_start", current: "Working", assistantText: "" }, "Working"],
    [{ type: "commit", current: "Working", assistantText: "Done" }, "Working"],
    [{ type: "error", current: "Working", assistantText: "" }, "Failed"],
    [{ type: "done", current: "Failed", assistantText: "" }, "Failed"],
    [{ type: "done", current: "Working", assistantText: "Finished" }, "Completed"],
    [{ type: "done", current: "Working", assistantText: "<question>Which region?\n- APAC\n- EMEA</question>" }, "Waiting for input"],
    [{ type: "cancelled", current: "Working", assistantText: "" }, "Stopped"]
  ];
  for (const [input, expected] of cases) assert.equal(outcome(input), expected);
});
