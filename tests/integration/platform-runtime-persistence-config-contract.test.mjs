import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const main = readFileSync("apps/platform-api/src/main.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const preflight = readFileSync("scripts/install/preflight.mjs", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

test("runtime persistence config exposes explicit legacy memory and prisma modes", () => {
  assert.match(appFactory, /export type CorePersistenceMode = "legacy" \| "memory" \| "prisma"/);
  assert.match(appFactory, /export function resolveCorePersistenceMode/);
  assert.match(appFactory, /export async function createRuntimePlatformApiServices/);
  assert.match(appFactory, /createPrismaCorePersistence\(env\.DATABASE_URL\)/);
  assert.match(appFactory, /new MemoryCorePersistenceClient\(\)/);
});

test("platform api main starts through runtime service factory", () => {
  assert.match(main, /createRuntimePlatformApiServices/);
  assert.match(main, /resolveCorePersistenceMode/);
  assert.match(main, /createPlatformApiApp\(services\)/);
  assert.match(main, /core persistence mode/);
});

test("private-server env and preflight contract include core persistence mode", () => {
  assert.match(envExample, /EVCP_CORE_PERSISTENCE=prisma/);
  assert.match(preflight, /EVCP_CORE_PERSISTENCE/);
  assert.match(preflight, /CORE_PERSISTENCE_MODES = \["legacy", "memory", "prisma"\]/);
});

test("persistence docs explain runtime modes and private-server default", () => {
  assert.match(persistenceDoc, /Runtime Mode/);
  assert.match(persistenceDoc, /EVCP_CORE_PERSISTENCE=prisma/);
  assert.match(persistenceDoc, /legacy/);
  assert.match(persistenceDoc, /memory/);
});
