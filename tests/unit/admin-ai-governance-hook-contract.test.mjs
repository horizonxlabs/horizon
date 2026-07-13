import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/admin-web/src/hooks/use-ai-governance.ts", "utf8");

test("governance hook is API-authoritative and never invents a key", () => {
  assert.match(source, /export function useAiGovernance/);
  assert.match(source, /client: PlatformApiClient \| undefined/);
  assert.match(source, /if \(!client\)/);
  assert.match(source, /client\.listAiProviders\(\)/);
  assert.match(source, /client\.listAiApiKeys\(\)/);
  assert.match(source, /client\.listGuardrailEvents\(\)/);
  assert.match(source, /if \(!canMutateAiGovernance\(availability\)\)/);
  assert.match(source, /if \(!secret\.trim\(\)\)/);
  assert.doesNotMatch(source, /replace-before-production/);
  assert.doesNotMatch(source, /local fallback/);
  assert.doesNotMatch(source, /legacyUserEmail/);
});
