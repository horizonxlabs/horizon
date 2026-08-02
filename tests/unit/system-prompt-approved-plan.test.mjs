import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const template = { name: "Web App", lockedFiles: [] };

test("renders the approved plan section when provided, before the project files", () => {
  const prompt = buildSystemPrompt({
    template, contextFiles: [], rollingSummary: null,
    approvedPlan: "1. Add a Header component.\n2. Wire it into app/page.tsx."
  });
  assert.match(prompt, /## Approved plan \(the user approved this plan — implement exactly it, nothing more\)/);
  assert.match(prompt, /Add a Header component\./);
  assert.ok(prompt.indexOf("## Approved plan") < prompt.indexOf("## Current project files"));
});

test("omits the approved plan section when not provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /## Approved plan/);
});

test("clips an oversized plan and appends a truncation note", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null, approvedPlan: "y".repeat(9000) });
  assert.match(prompt, /… \(plan truncated\)/);
});
