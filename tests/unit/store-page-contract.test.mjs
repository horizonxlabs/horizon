import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readAllSourceFiles(dir) {
  return readdirSync(dir)
    .map((entry) => {
      const fullPath = path.join(dir, entry);
      return statSync(fullPath).isDirectory()
        ? readAllSourceFiles(fullPath)
        : /\.(tsx?|jsx?)$/.test(entry)
          ? readFileSync(fullPath, "utf8")
          : "";
    })
    .join("");
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
  const source = readFileSync(
    "apps/app-store-pwa/src/features/storefront/StoreProvider.tsx",
    "utf8"
  );
  assert.match(source, /loadStoreBootstrap/);
  assert.match(source, /createStoreDeviceState/);
  assert.match(source, /createStorefrontStateStore/);
  assert.match(source, /logoutError/);
});

test("Store styles cover responsive workspace controls and application accents", () => {
  const css = readFileSync("packages/ui/styles.css", "utf8");

  for (const selector of [
    ".store-sidebar",
    ".store-topbar",
    ".store-content",
    ".store-navigation-trigger",
    ".store-drawer-backdrop",
    ".store-search-layout",
    ".store-app-detail-layout",
    ".store-profile-grid",
    ".store-state-panel",
    ".store-action-error",
    ".store-action-success"
  ]) {
    assert.match(css, new RegExp(`${selector.replace(".", "\\.")}\\s*\\{`));
  }

  assert.match(css, /grid-template-columns:\s*80px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.store-workspace\s+:where\(\s*button:not\(\[class\]\),/);
  assert.match(css, /\.store-sidebar nav a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.store-workspace\s+:where\([^}]*\)\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /:where\([^}]*\.secondary-button[^}]*\)\s*\{[^}]*min-height:\s*44px/s);
  assert.match(
    css,
    /\.store-navigation-trigger,\s*\.store-drawer-backdrop\s*\{\s*display:\s*none;/
  );
  for (let accent = 0; accent < 6; accent += 1) {
    assert.match(css, new RegExp(`\\[data-accent="${accent}"\\]`));
  }
});
