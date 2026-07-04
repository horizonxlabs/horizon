import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

function sourceBlock(startToken, endToken) {
  const start = adminSource.indexOf(startToken);
  const end = adminSource.indexOf(endToken, start);
  assert.notEqual(start, -1, `${startToken} not found`);
  assert.notEqual(end, -1, `${endToken} not found`);
  return adminSource.slice(start, end);
}

test("admin first-run install wizard defines complete ordered install steps", () => {
  const steps = sourceBlock("const installWizardSteps", "const installWizardPassingProfile");

  for (const token of ["preflight", "setup", "compose", "migrate_seed", "verify_health"]) {
    assert.match(steps, new RegExp(token));
  }

  assert.match(steps, /1\. Preflight/);
  assert.match(steps, /2\. Setup Config/);
  assert.match(steps, /3\. Compose Readiness/);
  assert.match(steps, /4\. Migrate \+ Seed/);
  assert.match(steps, /5\. Verify Health/);
});

test("admin install wizard setup evidence is secret-safe", () => {
  const setup = sourceBlock("function setupItemsFromConfig", "function preflightRowsFromReport");
  const saveHandler = sourceBlock("async function handleSaveInstallerSetup", "function handleWizardNext");

  assert.match(setup, /databaseUrlMasked/);
  assert.match(setup, /:\*\*\*@/);
  assert.match(setup, /fingerprint only/);
  assert.match(saveHandler, /storageSecretAccessKey: ""/);
  assert.match(saveHandler, /databaseUrl: setup\.databaseUrlMasked/);
  assert.doesNotMatch(setup, /postgresql:\/\/evcp:secret@/);
  assert.doesNotMatch(setup, /example-secret/);
});

test("admin install wizard can show ready and blocked preflight states", () => {
  assert.match(adminSource, /installWizardReadyRows/);
  assert.match(adminSource, /installWizardBlockedRows/);
  assert.match(adminSource, /Simulate Blocked Preflight/);
  assert.match(adminSource, /Install blocked by failed preflight checks/);
  assert.match(adminSource, /Install can proceed after setup review/);
});
