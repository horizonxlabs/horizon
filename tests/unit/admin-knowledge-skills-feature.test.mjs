import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Knowledge & Skills console is owned by the feature and calls the live governance API", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/knowledge-skills/index.ts", "utf8");
  const api = readFileSync("apps/admin-web/src/features/knowledge-skills/api.ts", "utf8");
  const adminConsole = readFileSync("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  // Feature barrel exposes the real console + hook (no static demo rows).
  assert.match(featureApi, /KnowledgeSkillsConsole/);
  assert.match(featureApi, /useKnowledgeSkills/);
  assert.doesNotMatch(featureApi, /knowledgeSourceRows/);

  // The API layer hits the real governance endpoints.
  assert.match(api, /\/admin\/knowledge\/sources/);
  assert.match(api, /\/admin\/skills/);

  // The console is wired into the admin navigation.
  assert.match(adminConsole, /KnowledgeSkillsConsole/);
  assert.match(adminConsole, /"knowledge"/);
  assert.doesNotMatch(main, /const knowledgeSkillKpis/);
});
