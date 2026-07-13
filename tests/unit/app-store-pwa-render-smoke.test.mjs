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
