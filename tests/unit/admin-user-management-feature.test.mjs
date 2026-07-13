import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Admin user creation is owned by the user-management feature", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/user-management/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(featureApi, /export \{ buildCreateUserPayload, generateTempPassword \}/);
  assert.match(main, /from "\.\/features\/user-management"/);
  assert.doesNotMatch(main, /export function buildCreateUserPayload/);
});
