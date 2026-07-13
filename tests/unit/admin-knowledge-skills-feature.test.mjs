import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Knowledge and skills evidence is owned by the knowledge-skills feature", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/knowledge-skills/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /knowledgeSourceRows/);
  assert.match(featureApi, /skillAssignmentRows/);
  assert.doesNotMatch(main, /const knowledgeSkillKpis/);
});
