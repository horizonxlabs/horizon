import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

test("core API persistence wiring keeps async executor and legacy executor available", () => {
  assert.match(appFactory, /export async function executePlatformApiRequestAsync/);
  assert.match(appFactory, /export function executePlatformApiRequest/);
  assert.match(appFactory, /corePersistence\?: CoreRepositoryBackedService/);
  assert.match(
    appFactory,
    /const useCorePersistence = Boolean\(\s*corePersistence\s*&&\s*isPersistenceCoreRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /const useAiGovernancePersistence = Boolean\(\s*aiGovernancePersistence\s*&&\s*isPersistenceAiGovernanceRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /const usePrdPersistence = Boolean\(\s*corePersistence\s*&&\s*prdPersistence\s*&&\s*isPersistencePrdRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /const useWorkspacePersistence = Boolean\(\s*corePersistence\s*&&\s*prdPersistence\s*&&\s*workspacePersistence\s*&&\s*isPersistenceWorkspaceRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /const usePublishStorePersistence = Boolean\(\s*corePersistence\s*&&\s*prdPersistence\s*&&\s*workspacePersistence\s*&&\s*publishStorePersistence\s*&&\s*isPersistencePublishStoreRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /const useGeneratedRuntimePersistence = Boolean\(\s*corePersistence\s*&&\s*publishStorePersistence\s*&&\s*generatedRuntimePersistence\s*&&\s*isPersistenceGeneratedRuntimeRoute\(request\)\s*\)/
  );
  assert.match(
    appFactory,
    /!useGeneratedRuntimePersistence[\s\S]+return executePlatformApiRequest\(services, request\)/
  );
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

test("PRD express routes use async persistence executor", () => {
  for (const route of [
    'routes.post("/projects/:projectId/prd/generate"',
    'routes.post("/projects/:projectId/prd/baseline"',
    'routes.get("/projects/:projectId/prd/versions"',
    'routes.get("/projects/:projectId/prd"'
  ]) {
    const index = appFactory.indexOf(route);
    assert.notEqual(index, -1, `${route} should exist`);
    const routeBlock = appFactory.slice(index, index + 420);
    assert.match(routeBlock, /sendPlatformResponseAsync/);
    assert.match(routeBlock, /executePlatformApiRequestAsync/);
  }
});

test("persistence operations doc names route-level wiring as current coverage", () => {
  assert.match(persistenceDoc, /Current Data Flow/);
  assert.match(persistenceDoc, /Route-Level Coverage/);
  assert.match(persistenceDoc, /Remaining Mock-to-Real Work/);
  assert.match(persistenceDoc, /The core API async executor can run/);
});
