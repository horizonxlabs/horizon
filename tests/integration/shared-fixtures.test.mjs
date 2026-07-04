import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const fixtures = readFileSync("packages/mock-data/src/index.ts", "utf8");
const adminApp = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const creatorApp = readFileSync("apps/creator-web/src/main.tsx", "utf8");
const storeApp = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");

test("all surfaces use shared mock data instead of private local fixtures", () => {
  assert.match(adminApp, /@evcp\/mock-data/);
  assert.match(creatorApp, /@evcp\/mock-data/);
  assert.match(storeApp, /@evcp\/mock-data/);
});

test("leave management demo data is shared across project and app store contexts", () => {
  assert.match(fixtures, /Leave Management/);
  assert.match(fixtures, /leave-management/);
  assert.match(fixtures, /HR Department/);
  assert.match(fixtures, /Employee/);
});

test("all surfaces use shared UI package", () => {
  assert.match(adminApp, /@evcp\/ui/);
  assert.match(creatorApp, /@evcp\/ui/);
  assert.match(storeApp, /@evcp\/ui/);
});

