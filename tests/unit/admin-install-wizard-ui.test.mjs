import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const consoleSource = readFileSync("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");
const installerEvidence = readFileSync("apps/admin-web/src/features/installer-operations/evidence.ts", "utf8");

test("installation journey remains feature-owned and ordered", () => {
  for (const token of ["prepare_server", "configure_environment", "preflight", "setup", "deploy_stack", "migrate_seed", "verify_health", "first_admin_login"]) {
    assert.match(installerEvidence, new RegExp(token));
  }
  assert.match(consoleSource, /from "@\/features\/installer-operations"/);
  assert.match(consoleSource, /First-run installation journey/);
  assert.match(consoleSource, /IT Admin/);
});

test("console retains first-run setup and session gates", () => {
  for (const token of ["getSetupStatus", 'setupStatus === "loading"', 'setupStatus === "incomplete"', "!sessionActive", "hasValidAdminSession"]) {
    assert.match(consoleSource, new RegExp(token));
  }
});
