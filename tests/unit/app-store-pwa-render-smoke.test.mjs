import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("app-store bootstrap delegates root composition and URL mapping", async () => {
  const [main, routes] = await Promise.all([
    source("apps/app-store-pwa/src/main.tsx"),
    source("apps/app-store-pwa/src/routes/StoreRoutes.tsx")
  ]);

  assert.match(main, /@\/app\/StoreApp/);
  assert.match(routes, /@\/features\/generated-leave-management/);
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
