import assert from "node:assert/strict";
import test from "node:test";

const { buildSystemPrompt } =
  await import("../../apps/platform-api/src/generation-loop/system-prompt.ts");

const template = { name: "Web App", lockedFiles: [] };

test("system prompt lists available skills as name+description (progressive disclosure)", () => {
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: null,
    availableSkills: [
      { name: "frontend-design", description: "Distinctive visual design guidance" }
    ],
    knowledgeExcerpts: ["Always use the org palette"]
  });
  assert.match(prompt, /Available governed skills/);
  assert.match(prompt, /- frontend-design:/);
  assert.match(prompt, /Distinctive visual design guidance/);
  assert.match(prompt, /load_governed_skill/);
  assert.doesNotMatch(prompt, /<action|<artifact/);
  assert.match(prompt, /Organizational knowledge/);
  assert.match(prompt, /Always use the org palette/);
});

test("system prompt omits the skill/knowledge sections when none are provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /Available governed skills/);
  assert.doesNotMatch(prompt, /Organizational knowledge/);
});
