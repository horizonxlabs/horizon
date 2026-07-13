import assert from "node:assert/strict";
import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";

test("Admin UI exposes first-run install wizard states and safe setup evidence", () => {
  const adminSource = readAllSourceFiles("apps/admin-web/src");

  for (const text of [
    "AdminRoutes",
    "SetupWizard",
    "installWizardSteps",
    "Prepare Server",
    "Configure Environment",
    "Deploy Stack",
    "Migrate + Seed",
    "First Admin Login",
    "Set up your Horizon platform",
    "Business / organization name",
    "Admin account",
    "initializeSetup"
  ]) {
    assert.match(adminSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
