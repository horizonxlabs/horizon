import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Service health evidence is owned by the platform-operations feature", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/platform-operations/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /serviceHealthRows/);
  assert.match(main, /from "\.\/features\/platform-operations"/);
  assert.doesNotMatch(main, /const serviceHealthRows/);
});
