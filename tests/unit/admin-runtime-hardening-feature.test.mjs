import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("runtime hardening exposes evidence through its feature API", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/runtime-hardening/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /runtimeKpis/);
  assert.match(featureApi, /runtimeContractRows/);
  assert.doesNotMatch(main, /const runtimeKpis/);
});
