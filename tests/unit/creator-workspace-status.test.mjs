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
    [
      {
        type: "done",
        current: "Working",
        assistantText: "<question>Which region?\n- APAC\n- EMEA</question>"
      },
      "Waiting for input"
    ],
    [{ type: "cancelled", current: "Working", assistantText: "" }, "Stopped"]
  ];
  for (const [input, expected] of cases) assert.equal(outcome(input), expected);
});

test("persisted Workspace history derives waiting, failed, working, and completed outcomes", () => {
  const outcome = vibeChat.workspaceOutcomeForHistory;
  assert.equal(typeof outcome, "function");
  assert.equal(
    outcome([
      { id: "u1", role: "user", text: "Configure deployment", actions: [] },
      {
        id: "a1",
        role: "assistant",
        text: "<question>Which region?\n- APAC\n- EMEA</question>",
        actions: []
      }
    ]),
    "Waiting for input"
  );
  assert.equal(
    outcome([
      { id: "u2", role: "user", text: "Update the form", actions: [] },
      {
        id: "a2",
        role: "assistant",
        text: "The edit did not apply",
        actions: [{ id: "edit-1", type: "edit", label: "form.tsx", status: "failed" }]
      }
    ]),
    "Failed"
  );
  assert.equal(
    outcome([
      { id: "u3", role: "user", text: "Generate the report", actions: [] },
      {
        id: "a3",
        role: "assistant",
        text: "",
        actions: [{ id: "run-1", type: "command", label: "build", status: "running" }]
      }
    ]),
    "Working"
  );
  assert.equal(
    outcome([
      { id: "u4", role: "user", text: "Generate the report", actions: [] },
      { id: "a4", role: "assistant", text: "Report generated", actions: [] }
    ]),
    "Completed"
  );
  assert.equal(outcome([]), "");
});
