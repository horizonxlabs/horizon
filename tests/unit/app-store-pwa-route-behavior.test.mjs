import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const { storeRouteFromPath } = await import("../../apps/app-store-pwa/src/routes/store-route.ts");
const { parseStoreSearchQuery } =
  await import("../../apps/app-store-pwa/src/features/storefront/store-navigation.ts");

test("Store route regression table resolves every enterprise workspace destination", () => {
  const routes = [
    ["/store/", { page: "my-apps" }],
    ["/store/available", { page: "available" }],
    ["/store/search", { page: "search" }],
    ["/store/favorites", { page: "favorites" }],
    ["/store/recent", { page: "recent" }],
    ["/store/access-requests", { page: "access-requests" }],
    ["/store/tickets", { page: "tickets" }],
    ["/store/tickets/T-1", { page: "ticket-detail", ticketId: "T-1" }],
    ["/store/profile", { page: "profile" }],
    ["/store/apps/payroll", { page: "app-detail", appSlug: "payroll" }],
    ["/store/unknown", { page: "not-found" }]
  ];

  for (const [pathname, expected] of routes) {
    assert.deepEqual(storeRouteFromPath(pathname), expected, pathname);
  }
  assert.equal(parseStoreSearchQuery("?q=payroll"), "payroll");
});

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
