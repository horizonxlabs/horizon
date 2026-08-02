import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("StoreProvider integration covers API, device, lifecycle, logout, and card navigation wiring", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/features/storefront/StoreProvider.integration.test.mjs"],
    { cwd: "apps/app-store-pwa", encoding: "utf8" }
  );
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /mounted Provider loads API collections/);
  assert.match(output, /mounted Provider suppresses stale refresh and preserves ready UI/);
});
