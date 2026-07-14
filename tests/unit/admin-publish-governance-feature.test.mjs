import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Publish governance fixtures stay isolated from the API-backed console", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/publish-governance/index.ts", "utf8");
  const main = readFileSync("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");

  assert.match(featureApi, /ticketCountRows/);
  assert.match(featureApi, /domainRequestRows/);
  assert.doesNotMatch(main, /from "@\/features\/publish-governance"/);
  assert.doesNotMatch(main, /ticketCountRows|domainRequestRows/);
});
