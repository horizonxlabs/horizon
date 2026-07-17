import assert from "node:assert/strict";
import test from "node:test";

const { createMessageParser } = await import("../../apps/platform-api/src/generation-loop/message-parser.ts");
const { buildSystemPrompt } = await import("../../apps/platform-api/src/generation-loop/system-prompt.ts");
const { buildSkillLoadFeedback } = await import(
  "../../apps/platform-api/src/generation-loop/generation-stream-helpers.ts"
);

const template = { name: "Web App", lockedFiles: [] };

test("message parser recognises a skill action and its name attribute", () => {
  const parser = createMessageParser();
  const events = [
    ...parser.push('<artifact id="s"><action type="skill" name="frontend-design"></action></artifact>'),
    ...parser.flush()
  ];
  const start = events.find((event) => event.type === "action_start");
  assert.equal(start.actionType, "skill");
  assert.equal(start.name, "frontend-design");
});

test("system prompt lists available skills as name+description (progressive disclosure)", () => {
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: null,
    availableSkills: [{ name: "frontend-design", description: "Distinctive visual design guidance" }],
    knowledgeExcerpts: ["Always use the org palette"]
  });
  assert.match(prompt, /<available_skills>/);
  assert.match(prompt, /<name>frontend-design<\/name>/);
  assert.match(prompt, /Distinctive visual design guidance/);
  // Full instructions are NOT injected up front — only on demand via the skill action.
  assert.match(prompt, /<action type="skill" name="THE_EXACT_NAME">/);
  assert.match(prompt, /Organizational knowledge/);
  assert.match(prompt, /Always use the org palette/);
});

test("system prompt omits the skill/knowledge sections when none are provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /<available_skills>/);
  assert.doesNotMatch(prompt, /Organizational knowledge/);
});

test("skill load feedback wraps the instructions, or degrades gracefully when missing", () => {
  const loaded = buildSkillLoadFeedback("frontend-design", "Make deliberate, opinionated choices.");
  assert.match(loaded, /<skill_content name="frontend-design">/);
  assert.match(loaded, /Make deliberate, opinionated choices\./);

  const missing = buildSkillLoadFeedback("nope", undefined);
  assert.match(missing, /not available/);
});
