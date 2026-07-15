import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const credentialDrawer = readFileSync(
  "apps/admin-web/src/features/ai-governance/drawers/CredentialDrawer.tsx",
  "utf8"
);
const useAiGovernance = readFileSync(
  "apps/admin-web/src/features/ai-governance/use-ai-governance.ts",
  "utf8"
);

test("credential secret is never written to browser storage", () => {
  assert.doesNotMatch(credentialDrawer, /(local|session)Storage/);
  assert.doesNotMatch(useAiGovernance, /(local|session)Storage/);
});
