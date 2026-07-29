import assert from "node:assert/strict";
import test from "node:test";

const { storeRouteFromPath } = await import("../../apps/app-store-pwa/src/routes/store-route.ts");

test("Store route resolver supports collection and parameter routes", () => {
  assert.deepEqual(storeRouteFromPath("/store"), { page: "my-apps" });
  assert.deepEqual(storeRouteFromPath("/store/"), { page: "my-apps" });
  assert.deepEqual(storeRouteFromPath("/store/available"), { page: "available" });
  assert.deepEqual(storeRouteFromPath("/store/search"), { page: "search" });
  assert.deepEqual(storeRouteFromPath("/store/favorites"), { page: "favorites" });
  assert.deepEqual(storeRouteFromPath("/store/recent"), { page: "recent" });
  assert.deepEqual(storeRouteFromPath("/store/access-requests"), { page: "access-requests" });
  assert.deepEqual(storeRouteFromPath("/store/tickets"), { page: "tickets" });
  assert.deepEqual(storeRouteFromPath("/store/profile"), { page: "profile" });
  assert.deepEqual(storeRouteFromPath("/store/apps/leave-management"), {
    page: "app-detail", appSlug: "leave-management"
  });
  assert.deepEqual(storeRouteFromPath("/store/tickets/ticket_1"), {
    page: "ticket-detail", ticketId: "ticket_1"
  });
  assert.deepEqual(storeRouteFromPath("/store/missing"), { page: "not-found" });
});

test("Store route resolver requires exact paths and safely decodes dynamic segments", () => {
  assert.deepEqual(storeRouteFromPath("/store/apps/leave%20management"), {
    page: "app-detail", appSlug: "leave management"
  });
  assert.deepEqual(storeRouteFromPath("/store/apps/leave/extra"), { page: "not-found" });
  assert.deepEqual(storeRouteFromPath("/store/tickets/ticket_1/extra"), { page: "not-found" });
  assert.deepEqual(storeRouteFromPath("/store/apps/%E0%A4%A"), { page: "not-found" });
  assert.deepEqual(storeRouteFromPath("/store/tickets/%E0%A4%A"), { page: "not-found" });
  assert.deepEqual(storeRouteFromPath("/stores"), { page: "not-found" });
});
