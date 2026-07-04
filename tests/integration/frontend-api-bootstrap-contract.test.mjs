import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");
const storeSource = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");

test("shared API client exposes frontend bootstrap routes and auth modes", () => {
  assert.match(apiClient, /class PlatformApiClient/);
  assert.match(apiClient, /getCurrentUser\(\)/);
  assert.match(apiClient, /listProjects\(\)/);
  assert.match(apiClient, /listStoreApps\(\)/);
  assert.match(apiClient, /authorization/);
  assert.match(apiClient, /x-mock-user-email/);
  assert.match(apiClient, /PlatformApiError/);
});

test("frontend shells use API-backed bootstrap instead of direct mock fixtures", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.doesNotMatch(source, /@evcp\/mock-data/);
    assert.match(source, /createPlatformApiClient/);
    assert.match(source, /platformSessionToken/);
    assert.match(source, /local fallback/);
  }

  assert.match(adminSource, /loadAdminBootstrap/);
  assert.match(creatorSource, /loadCreatorBootstrap/);
  assert.match(storeSource, /loadStoreBootstrap/);
});
