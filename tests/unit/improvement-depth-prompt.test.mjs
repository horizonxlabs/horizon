import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

function buildPrompt() {
  return buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
}

test("improvement requests demand deep, visibly different work — not the minimum edit", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /## Improvement requests/);
  // Thai + English trigger words are named so the model recognizes the intent in both.
  assert.match(prompt, /ปรับปรุง/);
  assert.match(prompt, /improve|polish|redesign/i);
  // the load-bearing directives
  assert.match(prompt, /minimum .*(is a failure|fails)/i);
  assert.match(prompt, /visibl\w+ (different|better)/i);
  assert.match(prompt, /thoroughness (beats|over) (latency|speed)/i);
});

test("the surgical rule is scoped to targeted changes, not improvement scopes", () => {
  const prompt = buildPrompt();
  // GOLDEN RULE remains for targeted changes and untouched areas…
  assert.match(prompt, /## THE GOLDEN RULE/);
  assert.match(prompt, /BYTE-FOR-BYTE/);
  // …but it must now say it applies to targeted changes / outside the requested scope.
  assert.match(prompt, /targeted change/i);
  assert.match(prompt, /outside the requested scope/i);
});
