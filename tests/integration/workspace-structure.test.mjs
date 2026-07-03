import { statSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const expectedPaths = [
  "apps/admin-web",
  "apps/creator-web",
  "apps/app-store-pwa",
  "apps/platform-api",
  "packages/ui",
  "packages/types",
  "packages/config",
  "packages/api-client",
  "packages/auth-sdk",
  "packages/mock-data",
  "generated-apps",
  "docker"
];

test("sprint 0 monorepo workspace boundaries exist", () => {
  for (const path of expectedPaths) {
    assert.equal(statSync(path).isDirectory(), true, `${path} should exist`);
  }
});

