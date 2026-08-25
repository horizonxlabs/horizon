import { readFileSync } from "node:fs";
import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const adminApp = readAllSourceFiles("apps/admin-web/src");
const creatorApp = readAllSourceFiles("apps/creator-web/src");
const storeApp = readAllSourceFiles("apps/app-store-pwa/src");
const navigation = readFileSync("packages/config/src/index.ts", "utf8");

test("admin creator and store shells expose the expected sprint 0 user journeys", () => {
  assert.match(adminApp, /Approved endpoints/);
  assert.match(adminApp, /AppShell/);
  assert.match(adminApp, /PageHeader/);
  assert.match(adminApp, /ServiceStrip/);
  assert.match(creatorApp, /Search projects/);
  assert.match(creatorApp, /SectionCard/);
  assert.match(creatorApp, /PRD Viewer/);
  assert.match(storeApp, /My Apps/);
  assert.match(storeApp, /Available Apps/);
  assert.match(storeApp, /StorefrontSummary/);
});

test("route map connects the three MVP surfaces", () => {
  assert.match(navigation, /\/admin/);
  assert.match(navigation, /\/creator/);
  assert.match(navigation, /\/store/);
  assert.match(navigation, /AI Providers/);
  assert.match(navigation, /Guardrails/);
  assert.match(navigation, /Tickets/);
});
