import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("packages/api-client/src/index.ts", "utf8");
const workspaceResources = readFileSync("packages/api-client/src/workspace-resources.ts", "utf8");

test("api client exposes success and failure response envelope helpers", () => {
  assert.match(source, /export function success/);
  assert.match(source, /export function failure/);
  assert.match(source, /ok: true/);
  assert.match(source, /ok: false/);
  assert.match(source, /traceId/);
});

test("api client exposes platform bootstrap client contract", () => {
  assert.match(source, /export class PlatformApiClient/);
  assert.match(source, /getCurrentUser/);
  assert.match(source, /listProjects/);
  assert.match(source, /listStoreApps/);
  assert.match(source, /sessionToken/);
  assert.match(source, /legacyUserEmail/);
  assert.match(source, /PlatformApiError/);
  assert.match(source, /createPlatformSessionStore/);
  assert.match(source, /startKeycloakLogin/);
  assert.doesNotMatch(source, /simulateSsoLogin/);
  assert.match(source, /export \* from "\.\/platform-session-store"/);
  assert.match(source, /export \* from "\.\/platform-session-client"/);
});

test("api client exposes workspace file browser contract", () => {
  // WorkspaceFilesResponse is declared in workspace-resources.ts and re-exported
  // from index.ts via `export type * from "./workspace-resources"`, so it is part
  // of the public api-client surface without appearing literally in index.ts.
  assert.match(workspaceResources, /WorkspaceFilesResponse/);
  assert.match(source, /export type \* from "\.\/workspace-resources"/);
  assert.match(source, /getWorkspaceFiles/);
  assert.match(workspaceResources, /\/workspace\/files/);
});
