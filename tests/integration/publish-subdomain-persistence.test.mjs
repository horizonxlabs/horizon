import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryPublishStorePersistenceClient,
  SubdomainConflictError,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";

const creator = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["app:publish-request"]
};

const migrationPath =
  "apps/platform-api/prisma/migrations/20260827010000_app_store_registry_subdomain/migration.sql";

function registryEntry({ id, appId, projectId, slug, subdomain }) {
  return {
    id,
    appId,
    projectId,
    deploymentRecordId: `dep_${slug}`,
    slug,
    subdomain,
    name: slug,
    route: `/apps/${slug}`,
    status: "published",
    visibility: "restricted",
    accessMode: "membership_or_invite",
    roleKeys: ["employee"],
    ownerUserId: creator.id,
    manifestVersion: "1",
    publishedAt: "2026-08-27T00:00:00.000Z"
  };
}

test("registry persistence permits the owning project but rejects another project's subdomain", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      registry: [
        registryEntry({
          id: "store_people",
          appId: "app_people",
          projectId: "prj_people",
          slug: "people",
          subdomain: "people-ops"
        })
      ]
    }),
    { baseDomain: "apps.example.test", secure: true }
  );

  assert.equal(
    await service.assertSubdomainAvailable(creator, "prj_people", "people-ops"),
    "people-ops"
  );
  await assert.rejects(
    () => service.assertSubdomainAvailable(creator, "prj_other", "people-ops"),
    (error) => {
      assert.ok(error instanceof SubdomainConflictError);
      assert.equal(error.code, "SUBDOMAIN_TAKEN");
      assert.equal(error.status, 409);
      return true;
    }
  );
});

test("registry mappings retain a legacy path route and derive configured subdomain URLs", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      registry: [
        registryEntry({
          id: "store_legacy",
          appId: "app_legacy",
          projectId: "prj_legacy",
          slug: "legacy-route",
          subdomain: null
        }),
        registryEntry({
          id: "store_people",
          appId: "app_people",
          projectId: "prj_people",
          slug: "people",
          subdomain: "people-ops"
        })
      ]
    }),
    { baseDomain: "apps.example.test", secure: true }
  );

  const entries = await service.listRegistry(creator);
  const legacy = entries.find((entry) => entry.projectId === "prj_legacy");
  const configured = entries.find((entry) => entry.projectId === "prj_people");
  const home = await service.listStoreApps(creator);
  const configuredCard = home.availableApps.find((entry) => entry.projectId === "prj_people");

  assert.equal(legacy?.route, "/apps/legacy-route");
  assert.equal(legacy?.subdomain, undefined);
  assert.equal(legacy?.subdomainUrl, undefined);
  assert.equal(configured?.route, "/apps/people");
  assert.equal(configured?.subdomain, "people-ops");
  assert.equal(configured?.subdomainUrl, "https://people-ops.apps.example.test");
  assert.equal(configuredCard?.route, "/apps/people");
  assert.equal(configuredCard?.subdomainUrl, "https://people-ops.apps.example.test");
});

test("registry subdomain migration remains additive and unique", () => {
  assert.equal(existsSync(migrationPath), true);
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(
    migration,
    /ALTER TABLE "app_store_registry_entries" ADD COLUMN "subdomain" TEXT;/
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "app_store_registry_entries_subdomain_key"\s+ON "app_store_registry_entries"\("subdomain"\);/
  );
});
