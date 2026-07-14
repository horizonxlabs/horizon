import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Installer operations fixtures stay isolated while the console uses API-backed operations", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/installer-operations/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");

  assert.match(featureApi, /installWizardSteps/);
  assert.match(featureApi, /restoreValidationRows/);
  assert.match(main, /from "@\/features\/platform-operations"/);
  assert.doesNotMatch(main, /installWizardSteps/);
  assert.doesNotMatch(main, /const operationsRecoveryKpis/);
});
