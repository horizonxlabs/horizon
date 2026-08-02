import assert from "node:assert/strict";
import test from "node:test";

const { filterStoreApps, selectStoreCollection } = await import("../../apps/app-store-pwa/src/features/storefront/catalog.ts");

const apps = [
  { slug: "leave-management", name: "Leave Management", description: "Employee leave approvals", owner: "People Team", myRole: "Manager", accessStatus: "active", installStatus: "installed" },
  { slug: "asset-register", name: "Asset Register", description: "Track company hardware", owner: "Operations", myRole: "Viewer", accessStatus: "available", installStatus: "not_installed" },
  { slug: "vendor-portal", name: "Vendor Portal", description: "Supplier onboarding", owner: "Procurement", myRole: undefined, accessStatus: "pending", installStatus: "disabled" }
];

test("catalog search matches name description owner and role", () => {
  assert.deepEqual(filterStoreApps(apps, "manager", { collection: "all" }).map((app) => app.slug), ["leave-management"]);
  assert.deepEqual(filterStoreApps(apps, "hardware", { collection: "all" }).map((app) => app.slug), ["asset-register"]);
  assert.deepEqual(filterStoreApps(apps, "people", { collection: "all" }).map((app) => app.slug), ["leave-management"]);
  assert.deepEqual(filterStoreApps(apps, "leave", { collection: "all" }).map((app) => app.slug), ["leave-management"]);
});

test("catalog filters collections, access, and installation without mutating inputs", () => {
  const original = apps.map((app) => app.slug);
  assert.deepEqual(filterStoreApps(apps, "", { collection: "my-apps" }).map((app) => app.slug), ["leave-management"]);
  assert.deepEqual(filterStoreApps(apps, "", { collection: "available" }).map((app) => app.slug), ["asset-register", "vendor-portal"]);
  assert.deepEqual(filterStoreApps(apps, "", { collection: "all", accessStatus: "pending" }).map((app) => app.slug), ["vendor-portal"]);
  assert.deepEqual(filterStoreApps(apps, "", { collection: "all", installStatus: "not_installed" }).map((app) => app.slug), ["asset-register"]);
  assert.deepEqual(apps.map((app) => app.slug), original);
});

test("catalog search trims, case-folds, and preserves the stable input order", () => {
  assert.deepEqual(filterStoreApps(apps, "  A  ", { collection: "all" }).map((app) => app.slug), ["leave-management", "asset-register", "vendor-portal"]);
  assert.deepEqual(filterStoreApps(apps, "", { collection: "all", accessStatus: "unknown" }).map((app) => app.slug), []);
});

test("My Apps and Available preserve the explicit Platform API collections", () => {
  const activeButUninstalled = { ...apps[0], slug: "active-uninstalled", installStatus: "not_installed" };
  const collections = {
    myApps: [apps[1]],
    availableApps: [activeButUninstalled],
    allApps: [apps[1], activeButUninstalled]
  };

  assert.deepEqual(selectStoreCollection("my-apps", collections, []).map((app) => app.slug), ["asset-register"]);
  assert.deepEqual(selectStoreCollection("available", collections, []).map((app) => app.slug), ["active-uninstalled"]);
});
