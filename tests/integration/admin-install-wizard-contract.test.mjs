import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const styles = readFileSync("packages/ui/styles.css", "utf8");
const installDoc = readFileSync("docs/operations/real-mvp-install.md", "utf8");
const uiSpec = readFileSync("docs/design/sprint-12-ui-spec.md", "utf8");

test("admin install wizard is wired to the installer preflight API contract", () => {
  assert.match(adminSource, /VITE_PLATFORM_API_BASE_URL/);
  assert.match(adminSource, /\/api/);
  assert.match(adminSource, /\/admin\/installer\/preflight/);
  assert.match(adminSource, /"x-mock-user-email": "admin@company.com"/);
  assert.match(adminSource, /runInstallerPreflight/);
});

test("admin install wizard uses EVCP operational UI classes and responsive styling", () => {
  assert.match(adminSource, /install-wizard-panel/);
  assert.match(adminSource, /install-wizard-steps/);
  assert.match(styles, /\.install-wizard-panel/);
  assert.match(styles, /\.install-wizard-steps/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /button:disabled/);
});

test("install documentation and UI spec describe the first-run wizard", () => {
  assert.match(installDoc, /Admin First-Run Install Wizard/);
  assert.match(installDoc, /\/api\/admin\/installer\/preflight/);
  assert.match(installDoc, /VITE_PLATFORM_API_BASE_URL/);
  assert.match(uiSpec, /first-run install wizard/);
  assert.match(uiSpec, /install-wizard-panel/);
  assert.match(uiSpec, /migrate\/seed/);
});

