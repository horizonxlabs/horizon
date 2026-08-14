import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanSystemPrompt,
  buildSystemPrompt
} from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const input = {
  template: { name: "Web App", lockedFiles: [], files: [] },
  contextFiles: [],
  rollingSummary: null,
  approvedPlan: "Step 1: add a Header."
};

test("Build prompt includes the approved plan", () => {
  const prompt = buildSystemPrompt(input);
  assert.match(prompt, /## Approved plan/);
  assert.match(prompt, /Step 1: add a Header/);
});

test("Plan prompt excludes approved implementation text", () => {
  const prompt = buildPlanSystemPrompt(input);
  assert.doesNotMatch(prompt, /## Approved plan|Step 1: add a Header/);
});
