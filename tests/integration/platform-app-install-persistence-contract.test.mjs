import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
// The PlatformRequest.path union (with the store install/uninstall template-literal
// route types) was extracted from app-factory.ts into platform-http-types.ts.
const platformHttpTypes = readFileSync("apps/platform-api/src/platform-http-types.ts", "utf8");
const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const storeDetailSource = readFileSync(
  "apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx",
  "utf8"
);
const storeProviderSource = readFileSync(
  "apps/app-store-pwa/src/features/storefront/StoreProvider.tsx",
  "utf8"
);
const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");
const migrationPath =
  "apps/platform-api/prisma/migrations/20260704000002_app_installations/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const endUserActor = {
  id: "usr_end_user",
  email: "user@company.com",
  name: "End User",
  role: "end_user",
  status: "active",
  permissions: ["store:use"]
};

function createSeededService() {
  return createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      apps: [
        {
          id: "app_leave_install",
          slug: "leave-install",
          name: "Leave Install",
          status: "published",
          projectId: "prj_leave_install",
          databaseSchemaName: "app_leave_install"
        }
      ],
      roles: [
        {
          id: "approle_app_leave_install_employee",
          appId: "app_leave_install",
          key: "employee",
          name: "Employee",
          permissions: ["leave:view-own"]
        }
      ],
      members: [
        {
          appId: "app_leave_install",
          userId: "usr_end_user",
          roleId: "approle_app_leave_install_employee",
          user: { id: "usr_end_user", email: "user@company.com", name: "End User" },
          role: {
            id: "approle_app_leave_install_employee",
            appId: "app_leave_install",
            key: "employee",
            name: "Employee",
            permissions: ["leave:view-own"]
          }
        }
      ],
      registry: [
        {
          id: "asre_leave_install",
          appId: "app_leave_install",
          projectId: "prj_leave_install",
          deploymentRecordId: "dep_leave_install_001",
          slug: "leave-install",
          name: "Leave Install",
          route: "/apps/leave-install",
          status: "published",
          visibility: "organization",
          accessMode: "restricted",
          roleKeys: ["employee"],
          ownerUserId: "usr_creator",
          manifestVersion: "1",
          publishedAt: "2026-07-04T04:10:00.000Z"
        }
      ]
    })
  );
}

test("App Store access membership stays usable across the legacy install lifecycle", async () => {
  const service = createSeededService();

  const beforeInstall = await service.listStoreApps(endUserActor);
  assert.equal(
    beforeInstall.myApps.some((app) => app.slug === "leave-install"),
    true
  );
  assert.equal(
    beforeInstall.availableApps.some((app) => app.slug === "leave-install"),
    false
  );
  assert.equal(beforeInstall.myApps[0].installStatus, "not_installed");
  assert.equal(beforeInstall.myApps[0].primaryAction, "open");
  assert.deepEqual(
    (await service.getStoreAppDetail(endUserActor, "leave-install")).actions,
    ["open", "submit_ticket", "send_feedback"]
  );

  const installed = await service.installStoreApp(endUserActor, { appSlug: "leave-install" });
  const afterInstall = await service.listStoreApps(endUserActor);
  const detail = await service.getStoreAppDetail(endUserActor, "leave-install");
  const uninstalled = await service.uninstallStoreApp(endUserActor, { appSlug: "leave-install" });
  const afterUninstall = await service.listStoreApps(endUserActor);

  assert.equal(installed.status, "active");
  assert.equal(installed.appSlug, "leave-install");
  assert.equal(
    afterInstall.myApps.some(
      (app) => app.slug === "leave-install" && app.installStatus === "installed"
    ),
    true
  );
  assert.deepEqual(detail.actions, ["open", "submit_ticket", "send_feedback"]);
  assert.equal(uninstalled.status, "disabled");
  assert.equal(
    afterUninstall.myApps.some(
      (app) => app.slug === "leave-install" && app.installStatus === "disabled"
    ),
    true
  );
  assert.equal(
    afterUninstall.availableApps.some((app) => app.slug === "leave-install"),
    false
  );
});

test("App Store install persistence contract is wired through schema API client and UI", () => {
  assert.match(schema, /model AppInstallation/);
  assert.match(schema, /appInstallations\s+AppInstallation\[\]/);
  assert.match(migration, /CREATE TABLE "app_installations"/);
  assert.match(platformHttpTypes, /`\/store\/apps\/\$\{string\}\/install`/);
  assert.match(platformHttpTypes, /`\/store\/apps\/\$\{string\}\/uninstall`/);
  assert.match(appFactory, /installStoreApp/);
  assert.match(appFactory, /uninstallStoreApp/);
  assert.match(apiClient, /installStoreApp\(appSlug: string\)/);
  assert.match(apiClient, /uninstallStoreApp\(appSlug: string\)/);
  assert.match(storeDetailSource, /api\.installStoreApp\(app\.slug\)/);
  assert.match(storeDetailSource, /api\.uninstallStoreApp\(app\.slug\)/);
  assert.match(storeDetailSource, /runAppAction\(app\.slug/);
  assert.match(storeProviderSource, /runAppAction<T>/);
  assert.match(storeProviderSource, /confirmedInstallationStatus\(action, result\)/);
  assert.match(persistenceDoc, /App Installation Route-Level Coverage/);
});
