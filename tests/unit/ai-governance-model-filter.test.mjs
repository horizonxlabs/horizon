import test from "node:test";
import assert from "node:assert/strict";

const { filterModels } = await import(
  "../../apps/admin-web/src/features/ai-governance/lib/model-catalog.ts"
);

const models = [
  { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini" },
  { id: "anthropic/claude-sonnet-4-5", name: "Anthropic: Claude Sonnet 4.5" }
];

test("filterModels returns all for an empty/whitespace query", () => {
  assert.equal(filterModels(models, "").length, 2);
  assert.equal(filterModels(models, "   ").length, 2);
});

test("filterModels matches id case-insensitively", () => {
  const r = filterModels(models, "CLAUDE");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "anthropic/claude-sonnet-4-5");
});

test("filterModels matches name substring", () => {
  const r = filterModels(models, "mini");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "openai/gpt-4.1-mini");
});
