import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readAllSourceFiles(dir) {
  return readdirSync(dir).map((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory()
      ? readAllSourceFiles(fullPath)
      : /\.(tsx?|jsx?)$/.test(entry) ? readFileSync(fullPath, "utf8") : "";
  }).join("");
}

test("Store history pages disclose device-local scope and unsupported actions", () => {
  const source = readAllSourceFiles("apps/app-store-pwa/src/features/storefront/pages");
  assert.match(source, /Stored on this device/);
  assert.match(source, /Platform API support required/);
  assert.match(source, /clearDevicePreferences/);
  assert.match(source, /getStoreTicket/);
  assert.match(source, /aria-disabled/);
});

test("Store device-history mounted behavior", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--test", "src/features/storefront/StoreDeviceHistoryPages.integration.test.mjs"], {
    cwd: "apps/app-store-pwa",
    encoding: "utf8",
    stdio: "pipe"
  });
});
