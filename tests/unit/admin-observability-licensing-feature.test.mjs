import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Observability and licensing evidence is owned by its feature", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/observability-licensing/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /telemetryExportRows/);
  assert.match(featureApi, /licenseEnforcementRows/);
  assert.doesNotMatch(main, /const observabilityLicenseKpis/);
});
