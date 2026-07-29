import assert from "node:assert/strict";
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

test("Store navigation points to distinct implemented pages", () => {
  const source = readAllSourceFiles("apps/app-store-pwa/src");
  for (const route of [
    "/store/",
    "/store/available",
    "/store/search",
    "/store/favorites",
    "/store/recent",
    "/store/access-requests",
    "/store/tickets",
    "/store/profile"
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(source, /StoreProvider/);
  assert.match(source, /StoreCollectionPage/);
  assert.match(source, /StoreSearchPage/);
});

test("Store collection cards use client navigation to Store detail routes", () => {
  const source = readFileSync(
    "apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx",
    "utf8"
  );
  assert.match(source, /navigateBrowserPath/);
  assert.match(source, /\/store\/apps\//);
  assert.doesNotMatch(source, /GeneratedLeaveManagementApp/);
});

test("Store provider separates Platform API bootstrap from versioned device state", () => {
  const source = readFileSync("apps/app-store-pwa/src/features/storefront/StoreProvider.tsx", "utf8");
  assert.match(source, /loadStoreBootstrap/);
  assert.match(source, /createStoreDeviceState/);
  assert.match(source, /createStorefrontAsyncController/);
  assert.match(source, /logoutError/);
});
