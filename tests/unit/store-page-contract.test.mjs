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

function cssBlock(css, marker) {
  const markerIndex = css.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing CSS marker: ${marker}`);
  const openingBrace = marker.endsWith("{")
    ? css.indexOf("{", markerIndex)
    : css.indexOf("{", markerIndex + marker.length);
  assert.notEqual(openingBrace, -1, `Missing CSS block for: ${marker}`);
  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(openingBrace + 1, index);
  }
  assert.fail(`Unclosed CSS block for: ${marker}`);
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
    ".store-sidebar-layout",
    ".store-sidebar-brand",
    ".store-sidebar-account",
    ".store-topbar",
    ".store-topbar-context",
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
    assert.ok(cssBlock(css, selector).trim().length > 0);
  }

  const mobile = cssBlock(css, "@media (max-width: 759px)");
  const mobileSidebar = cssBlock(mobile, ".store-sidebar {");
  assert.match(mobileSidebar, /height:\s*100dvh/);
  assert.match(mobileSidebar, /position:\s*fixed/);
  assert.match(mobileSidebar, /left:\s*0/);
  assert.match(mobileSidebar, /top:\s*0/);
  assert.match(mobileSidebar, /max-width:\s*320px/);
  assert.match(mobileSidebar, /width:\s*min\(88vw, 320px\)/);
  assert.match(mobileSidebar, /transform:\s*translateX\(-100%\)/);
  assert.match(cssBlock(mobile, ".store-sidebar-open"), /transform:\s*translateX\(0\)/);
  assert.match(mobile, /\.store-filter-rail,\s*\.store-app-action-rail\s*\{\s*position:\s*static;/);
  assert.match(
    cssBlock(mobile, ".store-workspace :is(a, button, input, select, textarea)"),
    /min-height:\s*44px/
  );

  const reducedMotion = cssBlock(css, "@media (prefers-reduced-motion: reduce)");
  const reducedWorkspace = cssBlock(reducedMotion, ".store-workspace *,");
  assert.match(reducedWorkspace, /animation-duration:\s*0\.01ms !important/);
  assert.match(reducedWorkspace, /animation-iteration-count:\s*1 !important/);
  assert.match(reducedWorkspace, /scroll-behavior:\s*auto !important/);
  assert.match(reducedWorkspace, /transition-duration:\s*0\.01ms !important/);

  for (let accent = 0; accent < 6; accent += 1) {
    assert.ok(cssBlock(css, `.store-app-icon[data-accent="${accent}"]`).trim().length > 0);
  }
});
