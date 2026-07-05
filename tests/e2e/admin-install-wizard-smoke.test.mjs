import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Admin UI exposes first-run install wizard states and safe setup evidence", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "First-run Installation Journey",
    "Prepare Server",
    "Configure Environment",
    "Deploy Stack",
    "Migrate + Seed",
    "First Admin Login",
    "Owner",
    "Evidence",
    "Next Action",
    "First-run Install Wizard",
    "Private-server install readiness",
    "Run Preflight",
    "Simulate Blocked Preflight",
    "Install blocked by failed preflight checks",
    "Install can proceed after setup review",
    "Setup evidence is ready without exposing secrets",
    "Save Setup",
    "Next Step",
    "databaseUrlMasked",
    "install-journey-board",
    "install-journey-card",
    "install-journey-meta",
    "install-wizard-panel",
    "install-wizard-steps",
    "install-wizard-action-row",
    "install-setup-form"
  ]) {
    assert.match(adminSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
