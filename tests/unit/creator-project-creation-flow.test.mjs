import assert from "node:assert/strict";
import test from "node:test";

const helpers = await import("../../apps/creator-web/src/app/creator-app-helpers.ts");
const {
  runBackgroundPrdGeneration,
  isPrdGenerationTimedOut,
  PRD_GENERATION_POLL_INTERVAL_MS,
  PRD_GENERATION_TIMEOUT_MS
} = helpers;

const draft = { id: "prd_todo", projectId: "prj_todo", version: "0.1", status: "draft" };

test("background PRD generation reports the draft without blocking project creation", async () => {
  const events = [];
  await runBackgroundPrdGeneration(
    { async generatePrdDraft(projectId) { events.push(["prd", projectId]); return draft; } },
    "prj_todo",
    {
      onDraft: (received) => events.push(["draft", received.id]),
      onError: () => events.push(["error"])
    }
  );
  assert.deepEqual(events, [["prd", "prj_todo"], ["draft", "prd_todo"]]);
});

test("background PRD generation surfaces failures as Error and never throws", async () => {
  const errors = [];
  await runBackgroundPrdGeneration(
    { async generatePrdDraft() { throw new Error("provider unavailable"); } },
    "prj_todo",
    { onDraft: () => assert.fail("draft must not be reported"), onError: (e) => errors.push(e) }
  );
  await runBackgroundPrdGeneration(
    { async generatePrdDraft() { throw "boom"; } },
    "prj_todo",
    { onDraft: () => assert.fail("draft must not be reported"), onError: (e) => errors.push(e) }
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /provider unavailable/);
  assert.ok(errors[1] instanceof Error);
});

test("the old blocking create+generate helper is gone", () => {
  assert.equal(helpers.createProjectWithInitialPrd, undefined);
});

test("polling recovery has a sane cadence and gives the AI enough time", () => {
  assert.ok(PRD_GENERATION_POLL_INTERVAL_MS >= 2_000);
  assert.ok(PRD_GENERATION_TIMEOUT_MS >= 5 * 60_000, "PRD calls can take minutes");
  assert.equal(isPrdGenerationTimedOut(0, PRD_GENERATION_TIMEOUT_MS - 1), false);
  assert.equal(isPrdGenerationTimedOut(0, PRD_GENERATION_TIMEOUT_MS), true);
});
