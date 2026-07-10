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

  for (const token of ["prepare_server", "configure_environment", "preflight", "setup", "deploy_stack", "migrate_seed", "verify_health", "first_admin_login"]) {
    assert.match(steps, new RegExp(token));
  }

  assert.match(steps, /1\. Prepare Server/);
  assert.match(steps, /2\. Configure Environment/);
  assert.match(steps, /3\. Run Preflight/);
  assert.match(steps, /4\. Save Setup/);
  assert.match(steps, /5\. Deploy Stack/);
  assert.match(steps, /6\. Migrate \+ Seed/);
  assert.match(steps, /7\. Verify Health/);
  assert.match(steps, /8\. First Admin Login/);
});

test("admin first-run installation journey exposes owner evidence and next action", () => {
  const journey = sourceBlock("function buildInstallJourneySteps", "const observabilityLicenseKpis");
  const ui = sourceBlock("aria-label=\"First-run installation journey\"", "eyebrow=\"Setup Wizard\"");

  for (const token of ["owner", "evidence", "nextAction", "install-journey-board", "install-journey-card"]) {
    assert.match(`${journey}\n${ui}`, new RegExp(token));
  }

  assert.match(journey, /Docker host/);
  assert.match(journey, /\/admin\/installer\/preflight/);
  assert.match(journey, /docker compose --env-file/);
  assert.match(journey, /prisma migrate deploy/);
  assert.match(journey, /\/api\/auth\/me/);
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

test("admin first-run setup gates the console until setup and login are complete", () => {
  assert.match(adminSource, /getSetupStatus/);
  assert.match(adminSource, /setupStatus === "loading"/);
  assert.match(adminSource, /setupStatus === "incomplete"/);
  assert.match(adminSource, /<SetupWizard onComplete=/);
  assert.match(adminSource, /!sessionActive/);
  assert.match(adminSource, /<AdminLoginScreen onLoggedIn=/);
  assert.match(adminSource, /hasValidAdminSession/);
  assert.match(adminSource, /firstAdminTemporaryPassword: ""/);
});
