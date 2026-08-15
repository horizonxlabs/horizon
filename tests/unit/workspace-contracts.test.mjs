import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkspaceContracts } from "../../scripts/quality/workspace-contracts.mjs";

test("shared packages must declare a root export", () => {
  const failures = validateWorkspaceContracts([
    {
      directory: "packages/types",
      manifest: { name: "@evcp/types", private: true }
    }
  ]);

  assert.deepEqual(failures, [
    'packages/types/package.json must declare package.json "exports" with a "." entry'
  ]);
});

test("internal dependencies must use the workspace protocol", () => {
  const failures = validateWorkspaceContracts([
    {
      directory: "packages/types",
      manifest: { name: "@evcp/types", exports: { ".": "./src/index.ts" } }
    },
    {
      directory: "packages/config",
      manifest: {
        name: "@evcp/config",
        exports: { ".": "./src/index.ts" },
        dependencies: { "@evcp/types": "^1.0.0" }
      }
    }
  ]);

  assert.deepEqual(failures, [
    'packages/config/package.json dependency "@evcp/types" must use the workspace: protocol'
  ]);
});

test("workspace dependency cycles are rejected", () => {
  const failures = validateWorkspaceContracts([
    {
      directory: "packages/auth-sdk",
      manifest: {
        name: "@evcp/auth-sdk",
        exports: { ".": "./src/index.ts" },
        dependencies: { "@evcp/types": "workspace:*" }
      }
    },
    {
      directory: "packages/types",
      manifest: {
        name: "@evcp/types",
        exports: { ".": "./src/index.ts" },
        dependencies: { "@evcp/auth-sdk": "workspace:*" }
      }
    }
  ]);

  assert.deepEqual(failures, [
    "workspace dependency cycle: @evcp/auth-sdk -> @evcp/types -> @evcp/auth-sdk"
  ]);
});

test("shared packages cannot depend on applications", () => {
  const failures = validateWorkspaceContracts([
    {
      directory: "apps/admin-web",
      manifest: { name: "@evcp/admin-web" }
    },
    {
      directory: "packages/ui",
      manifest: {
        name: "@evcp/ui",
        exports: { ".": "./src/index.tsx" },
        dependencies: { "@evcp/admin-web": "workspace:*" }
      }
    }
  ]);

  assert.deepEqual(failures, [
    'packages/ui/package.json must not depend on application package "@evcp/admin-web"'
  ]);
});
