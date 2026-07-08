import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readAllSourceFiles(dir) {
  const entries = readdirSync(dir);
  let combined = "";
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      combined += readAllSourceFiles(fullPath);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      combined += readFileSync(fullPath, "utf8");
    }
  }
  return combined;
}

const fixtures = readFileSync("packages/mock-data/src/index.ts", "utf8");
const adminApp = readFileSync("apps/admin-web/src/main.tsx", "utf8");
// creator-web's main.tsx was split into hooks/pages modules; scan the whole src tree.
const creatorApp = readAllSourceFiles("apps/creator-web/src");
const storeApp = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");

test("frontend shells no longer import mock data directly for bootstrap state", () => {
  assert.doesNotMatch(adminApp, /@evcp\/mock-data/);
  assert.doesNotMatch(creatorApp, /@evcp\/mock-data/);
  assert.doesNotMatch(storeApp, /@evcp\/mock-data/);
  assert.match(adminApp, /createPlatformApiClient/);
  assert.match(creatorApp, /createPlatformApiClient/);
  assert.match(storeApp, /createPlatformApiClient/);
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
