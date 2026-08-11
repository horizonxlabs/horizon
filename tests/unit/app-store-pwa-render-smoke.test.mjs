import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

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
  assert.match(css, /\.store-workspace\s*\{/);
  assert.match(css, /grid-template-columns:\s*240px minmax\(0, 1fr\)/);
  assert.match(css, /\.store-app-grid\s*\{/);
  assert.match(css, /repeat\(auto-fill, minmax\(240px, 1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*1199px\)/);
  assert.match(css, /@media \(max-width:\s*759px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
