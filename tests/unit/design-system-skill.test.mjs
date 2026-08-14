import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { DESIGN_SYSTEM_SKILL } = await import(
  "../../apps/platform-api/src/ai-governance/design-system-skill.ts"
);

test("base prompt teaches layout recipes per app shape", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  assert.match(prompt, /## Layout recipes/);
  assert.match(prompt, /bento/i);
  assert.match(prompt, /AppShell/);
  assert.match(prompt, /max-w-xl|single column/i);
  // dashboards default to the dark chrome the tokens were built for
  assert.match(prompt, /dark/i);
});

test("design-system skill ships a deep playbook behind progressive disclosure", () => {
  assert.equal(DESIGN_SYSTEM_SKILL.key, "design-system");
  assert.ok(DESIGN_SYSTEM_SKILL.name.length > 0);
  // the description is the loading trigger — it must say when to reach for the skill
  assert.match(DESIGN_SYSTEM_SKILL.description, /design|redesign|dashboard|visual/i);
  const instruction = DESIGN_SYSTEM_SKILL.instruction;
  assert.ok(instruction.length > 2000, "playbook must be substantial");
  for (const topic of [
    "bento",
    "StatCard",
    "AppShell",
    "EmptyState",
    "surface-dark",
    "tabular-nums",
    "Anuphan"
  ]) {
    assert.match(instruction, new RegExp(topic, "i"), `playbook missing ${topic}`);
  }
  // Thai typography guidance is part of the enterprise bar for this market
  assert.match(instruction, /Thai|ภาษาไทย/);
});
