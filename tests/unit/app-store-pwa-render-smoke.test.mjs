import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

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

test("app-store bootstrap delegates root composition and URL mapping", async () => {
  const [main, routes, storefront] = await Promise.all([
    source("apps/app-store-pwa/src/main.tsx"),
    source("apps/app-store-pwa/src/routes/StoreRoutes.tsx"),
    source("apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx")
  ]);

  assert.match(main, /@\/app\/StoreApp/);
  assert.match(routes, /@\/features\/generated-leave-management/);
  assert.match(routes, /useBrowserPath/);
  assert.match(routes, /usePageHeadingFocus/);
  assert.match(routes, /storeRouteFromPath/);
  assert.match(routes, /<StorefrontApp route={route} \/>/);
  assert.match(storefront, /<StoreProvider>/);
  assert.match(storefront, /<StoreShell route={route}>/);
  assert.doesNotMatch(main, /function GeneratedLeaveManagementApp/);
});

test("shared platform client remains generic while storefront owns Store configuration", async () => {
  const [sharedClient, storefrontClient] = await Promise.all([
    source("apps/app-store-pwa/src/shared/platform-client.ts"),
    source("apps/app-store-pwa/src/features/storefront/platform-client.ts")
  ]);

  assert.match(sharedClient, /createConfiguredPlatformApiClient/);
  assert.match(sharedClient, /\(configured \|\| "\/api"\)\.replace/);
  assert.doesNotMatch(sharedClient, /!configured && import\.meta\.env\.DEV \? undefined/);
  assert.doesNotMatch(sharedClient, /createStorePlatformClient|@company\.com/);
  assert.match(storefrontClient, /createStorePlatformClient/);
  assert.match(storefrontClient, /startStoreKeycloakLogin/);
  assert.match(storefrontClient, /startStoreKeycloakLogout/);
  assert.match(storefrontClient, /startKeycloakLogout/);
  assert.doesNotMatch(storefrontClient, /legacyUserEmail|user@company\.com/);
});

test("Store stylesheet defines enterprise frame and responsive navigation", async () => {
  const css = await source("packages/ui/styles.css");
  const desktopFrame = cssBlock(css, ".store-workspace-frame");
  const desktopGrid = cssBlock(css, ".store-app-grid");
  const wideDesktop = cssBlock(css, "@media (min-width: 1440px)");
  const tablet = cssBlock(css, "@media (max-width: 1199px) and (min-width: 760px)");
  const mobile = cssBlock(css, "@media (max-width: 759px)");

  assert.match(desktopFrame, /grid-template-columns:\s*240px minmax\(0, 1fr\)/);
  assert.match(desktopGrid, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(
    cssBlock(wideDesktop, ".store-app-grid"),
    /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/
  );
  assert.match(
    cssBlock(tablet, ".store-workspace-frame"),
    /grid-template-columns:\s*80px minmax\(0, 1fr\)/
  );
  assert.match(
    cssBlock(tablet, ".store-app-grid"),
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.match(cssBlock(mobile, ".store-app-grid,"), /grid-template-columns:\s*1fr/);
});
