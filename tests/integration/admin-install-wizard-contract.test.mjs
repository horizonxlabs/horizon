import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const styles = readFileSync("packages/ui/styles.css", "utf8");
const installDoc = readFileSync("docs/operations/real-mvp-install.md", "utf8");
const uiSpec = readFileSync("docs/design/sprint-12-ui-spec.md", "utf8");

test("admin install wizard is wired to the installer preflight API contract", () => {
  assert.match(adminSource, /VITE_PLATFORM_API_BASE_URL/);
  assert.match(adminSource, /\/api/);
  assert.match(adminSource, /createAdminPlatformClient/);
  assert.match(adminSource, /legacyUserEmail: "admin@company.com"/);
  assert.match(adminSource, /runInstallerPreflight/);
  assert.match(adminSource, /saveInstallerSetup/);
  assert.match(apiClient, /\/admin\/installer\/preflight/);
  assert.match(apiClient, /\/admin\/installer\/setup/);
  assert.match(apiClient, /\/admin\/installer\/reports/);
});

test("admin install wizard uses EVCP operational UI classes and responsive styling", () => {
  assert.match(adminSource, /install-journey-board/);
  assert.match(adminSource, /install-journey-card/);
  assert.match(adminSource, /install-journey-meta/);
  assert.match(adminSource, /install-wizard-panel/);
  assert.match(adminSource, /install-wizard-steps/);
  assert.match(adminSource, /install-wizard-action-row/);
  assert.match(adminSource, /install-setup-form/);
  assert.match(styles, /\.install-journey-board/);
  assert.match(styles, /\.install-journey-card/);
  assert.match(styles, /\.install-journey-meta/);
  assert.match(styles, /\.install-wizard-panel/);
  assert.match(styles, /\.install-wizard-steps/);
  assert.match(styles, /\.install-setup-form/);
  assert.match(styles, /\.first-run-shell/);
  assert.match(styles, /\.first-run-hero/);
  assert.match(styles, /\.first-run-layout/);
  assert.match(styles, /\.first-run-form/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /button:disabled/);
});

test("admin first-run screen behaves like an initial product setup gate", () => {
  assert.match(adminSource, /First-run Setup/);
  assert.match(adminSource, /ตั้งค่า Horizon/);
  assert.match(adminSource, /Platform Admin คนแรก/);
  assert.match(adminSource, /firstRunSetupIsComplete/);
  assert.match(adminSource, /Create admin & finish setup/);
  assert.match(adminSource, /Enter Admin Console/);
  assert.match(adminSource, /firstAdminTemporaryPassword/);
});

test("install documentation and UI spec describe the first-run wizard", () => {
  assert.match(installDoc, /Admin First-Run Install Wizard/);
  assert.match(installDoc, /First-Run Installation Journey/);
  assert.match(installDoc, /Prepare Server/);
  assert.match(installDoc, /First Admin Login/);
  assert.match(installDoc, /\/api\/admin\/installer\/preflight/);
  assert.match(installDoc, /VITE_PLATFORM_API_BASE_URL/);
  assert.match(uiSpec, /first-run install wizard/);
  assert.match(uiSpec, /install-journey-board/);
  assert.match(uiSpec, /owner, evidence and next action/);
  assert.match(uiSpec, /install-wizard-panel/);
  assert.match(uiSpec, /migrate\/seed/);
});
