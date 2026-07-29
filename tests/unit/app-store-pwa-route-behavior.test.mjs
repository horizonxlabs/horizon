import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("StoreRoutes mounts real Store and generated-app branches", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/routes/StoreRoutes.behavior.test.mjs"],
    {
      cwd: "apps/app-store-pwa",
      encoding: "utf8"
    }
  );

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /StoreRoutes composes the Store provider/);
  assert.match(output, /logout errors retain Store chrome/);
});
