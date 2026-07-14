import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = new URL("../../apps/admin-web/src/features/ai-governance/AiGovernancePanel.tsx", import.meta.url);

test("Admin AI governance panel provides provider, secret-store, route, quota, and test-call controls", async () => {
  const source = await readFile(panelPath, "utf8");
  for (const label of ["Register approved endpoint", "Store provider credential", "Governed scenario route", "Hard-stop budget", "Block unsafe prompts", "Live governed provider test"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Anthropic native/);
  assert.match(source, /adapter: providerAdapter/);
  assert.match(source, /type="password"/);
  assert.match(source, /ai\.saveApiKey/);
  assert.match(source, /ai\.configureRoute/);
  assert.match(source, /Fallback provider/);
  assert.match(source, /Fallback model/);
  assert.match(source, /fallbackProviderId/);
  assert.match(source, /fallbackModel/);
  assert.match(source, /ai\.configureQuota/);
  assert.match(source, /ai\.createGuardrailRule/);
  assert.match(source, /ai\.testProvider/);
  assert.doesNotMatch(source, /localStorage.*keySecret|keySecret.*localStorage/);
});
