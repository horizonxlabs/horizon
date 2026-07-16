import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminAppSource = readFileSync("apps/admin-web/src/app/AdminApp.tsx", "utf8");
const adminRoutesSource = readFileSync("apps/admin-web/src/routes/AdminRoutes.tsx", "utf8");
const adminClientSource = readFileSync("apps/admin-web/src/shared/platform-client.ts", "utf8");
const adminConsoleSource = readFileSync(
  "apps/admin-web/src/features/admin-console/AdminConsole.tsx",
  "utf8"
);
const adminSource = `${adminAppSource}\n${adminRoutesSource}\n${adminClientSource}\n${adminConsoleSource}`;
const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const styles = readFileSync("packages/ui/styles.css", "utf8");
const installDoc = readFileSync("docs/operations/real-mvp-install.md", "utf8");
const uiSpec = readFileSync("docs/design/sprint-12-ui-spec.md", "utf8");

test("admin install wizard is wired to the installer preflight API contract", () => {
  assert.match(adminSource, /VITE_PLATFORM_API_BASE_URL/);
  assert.match(adminSource, /\/api/);
  assert.match(adminSource, /createAdminPlatformClient/);
  assert.match(adminSource, /createSessionAwareFetch/);
  assert.doesNotMatch(adminSource, /legacyUserEmail/);
  assert.match(apiClient, /runInstallerPreflight\(/);
  assert.match(apiClient, /saveInstallerSetup\(/);
  assert.match(apiClient, /\/admin\/installer\/preflight/);
  assert.match(apiClient, /\/admin\/installer\/setup/);
  assert.match(apiClient, /\/admin\/installer\/reports/);
});

test("admin install wizard uses EVCP operational UI classes and responsive styling", () => {
  const setupWizard = readFileSync("apps/admin-web/src/setup-wizard.tsx", "utf8");
  // Redesigned to reuse the polished login split-shell (creator-auth-*) plus setup-specific
  // helpers (setup-shell, stepper, field grid, actions) — all defined in the design system.
  assert.match(setupWizard, /creator-auth-screen/);
  assert.match(setupWizard, /creator-auth-shell setup-shell/);
  assert.match(setupWizard, /creator-auth-steps/);
  assert.match(setupWizard, /creator-auth-grid/);
  assert.match(setupWizard, /creator-auth-actions/);
  assert.match(styles, /\.setup-shell/);
  assert.match(styles, /\.creator-auth-steps/);
  assert.match(styles, /\.creator-auth-grid/);
  assert.match(styles, /\.creator-auth-actions/);
  assert.match(styles, /@media \(min-width: 860px\)/);
  assert.match(styles, /\.creator-auth-submit:disabled/);
});

test("admin first-run screen behaves like an initial product setup gate", () => {
  const setupWizard = readFileSync("apps/admin-web/src/setup-wizard.tsx", "utf8");
  const loginScreen = readFileSync("apps/admin-web/src/login-screen.tsx", "utf8");
  assert.match(adminConsoleSource, /getSetupStatus/);
  assert.match(adminRoutesSource, /<SetupWizard onComplete=/);
  assert.match(adminRoutesSource, /<AdminLoginScreen onLoggedIn=/);
  assert.match(setupWizard, /initializeSetup/);
  assert.match(setupWizard, /businessName/);
  assert.match(loginScreen, /startAdminKeycloakLogin/);
  assert.match(setupWizard, /Create admin & finish/);
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
