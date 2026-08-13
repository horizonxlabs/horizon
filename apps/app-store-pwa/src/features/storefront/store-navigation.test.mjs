import assert from "node:assert/strict";
import test from "node:test";
import {
  STORE_NAVIGATION_GROUPS,
  isStoreRouteActive,
  parseStoreSearchQuery,
  storeCurrentPath,
  storePageContext,
  storeSearchHref
} from "./store-navigation.ts";

test("navigation is grouped by Workspace, Service, and Account", () => {
  assert.deepEqual(
    STORE_NAVIGATION_GROUPS.map((group) => group.label),
    ["Workspace", "Service", "Account"]
  );
  assert.deepEqual(
    STORE_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.route)),
    [
      "/store/",
      "/store/available",
      "/store/search",
      "/store/favorites",
      "/store/recent",
      "/store/access-requests",
      "/store/tickets",
      "/store/profile"
    ]
  );
});

test("detail routes keep their parent navigation and contextual page copy", () => {
  assert.equal(storeCurrentPath({ page: "app-detail", appSlug: "payroll" }), "/store/available");
  assert.equal(storeCurrentPath({ page: "ticket-detail", ticketId: "T-1" }), "/store/tickets");
  assert.equal(storePageContext({ page: "search" }).title, "Search");
  assert.equal(isStoreRouteActive("/store/tickets/T-1", "/store/tickets"), true);
});

test("search helpers trim, encode, and parse q without throwing", () => {
  assert.equal(storeSearchHref(" payroll & leave "), "/store/search?q=payroll%20%26%20leave");
  assert.equal(storeSearchHref("   "), "/store/search");
  assert.equal(parseStoreSearchQuery("?q=payroll%20%26%20leave"), "payroll & leave");
  assert.equal(parseStoreSearchQuery("?collection=all"), "");
});
