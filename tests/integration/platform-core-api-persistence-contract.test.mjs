import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

test("core API persistence wiring keeps async executor and legacy executor available", () => {
  assert.match(appFactory, /export async function executePlatformApiRequestAsync/);
  assert.match(appFactory, /export function executePlatformApiRequest/);
  assert.match(appFactory, /corePersistence\?: CoreRepositoryBackedService/);
  assert.match(appFactory, /const useCorePersistence = Boolean\(corePersistence && isPersistenceCoreRoute\(request\)\)/);
  assert.match(appFactory, /const useAiGovernancePersistence = Boolean\(aiGovernancePersistence && isPersistenceAiGovernanceRoute\(request\)\)/);
  assert.match(appFactory, /if \(!useCorePersistence && !useAiGovernancePersistence\) return executePlatformApiRequest/);
});

test("core API persistence wiring covers auth project and audit routes", () => {
  for (const route of ["/auth/me", "/projects", "/audit-logs", "/audit-logs/filter"]) {
    assert.match(appFactory, new RegExp(route.replaceAll("/", "\\/")));
  }

  assert.match(appFactory, /resolvePersistenceAuth/);
  assert.match(appFactory, /buildAuthEvidence/);
  assert.match(appFactory, /corePersistence\.createProject/);
  assert.match(appFactory, /corePersistence\.listProjects/);
  assert.match(appFactory, /corePersistence\.recordAudit/);
  assert.match(appFactory, /corePersistence\.filterAudit/);
  assert.match(appFactory, /sendPlatformResponseAsync/);
});

test("persistence operations doc names route-level wiring as current coverage", () => {
  assert.match(persistenceDoc, /Current Data Flow/);
  assert.match(persistenceDoc, /Route-Level Coverage/);
  assert.match(persistenceDoc, /Remaining Mock-to-Real Work/);
  assert.match(persistenceDoc, /The core API async executor can run/);
});
