import { readFileSync } from "node:fs";
import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const adminApp = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const creatorApp = readAllSourceFiles("apps/creator-web/src");
const storeApp = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");
const navigation = readFileSync("packages/config/src/index.ts", "utf8");

test("admin creator and store shells expose the expected sprint 0 user journeys", () => {
  assert.match(adminApp, /AI Providers & API Keys/);
  assert.match(adminApp, /AppShell/);
  assert.match(adminApp, /PageHeader/);
  assert.match(adminApp, /ServiceStrip/);
  assert.match(creatorApp, /Search projects/);
  assert.match(creatorApp, /SectionCard/);
  assert.match(creatorApp, /PRD Viewer/);
  assert.match(storeApp, /My Apps/);
  assert.match(storeApp, /Available Apps/);
  assert.match(storeApp, /AppCard/);
});

test("route map connects the three MVP surfaces", () => {
  assert.match(navigation, /\/admin/);
  assert.match(navigation, /\/creator/);
  assert.match(navigation, /\/store/);
  assert.match(navigation, /AI Providers/);
  assert.match(navigation, /Guardrails/);
  assert.match(navigation, /Tickets/);
});
