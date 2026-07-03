import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const adminApp = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const creatorApp = readFileSync("apps/creator-web/src/main.tsx", "utf8");
const storeApp = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");
const navigation = readFileSync("packages/config/src/index.ts", "utf8");

test("admin creator and store shells expose the expected sprint 0 user journeys", () => {
  assert.match(adminApp, /AI Providers & API Keys/);
  assert.match(adminApp, /ServiceStatusList/);
  assert.match(creatorApp, /Project Picker/);
  assert.match(creatorApp, /ProjectCard/);
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
