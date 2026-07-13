import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("security and release readiness exposes evidence through its feature API", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/security-release-readiness/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /securityReleaseKpis/);
  assert.match(featureApi, /rtmRegressionRows/);
  assert.doesNotMatch(main, /const securityReleaseKpis/);
});
