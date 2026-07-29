import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const template = { name: "Web App", lockedFiles: [] };

test("renders the product spec section when provided, before the project files", () => {
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: null,
    productSpec: "## Overview\nAn expense tracker."
  });
  assert.match(prompt, /## Product spec \(the approved PRD — build toward it\)/);
  assert.match(prompt, /An expense tracker\./);
  assert.ok(prompt.indexOf("## Product spec") < prompt.indexOf("## Current project files"));
});

test("omits the product spec section when not provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /## Product spec/);
});
