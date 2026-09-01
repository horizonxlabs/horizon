import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryPublishStorePersistenceClient,
  SubdomainConflictError,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";
import { PermissionError } from "../../apps/platform-api/src/platform-services.ts";

const creator = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["app:publish-request"]
};

const otherCreator = {
  ...creator,
  id: "usr_other_creator",
  email: "other.creator@company.com",
  name: "Other Creator"
};

const endUser = {
  ...creator,
  id: "usr_end_user",
  email: "user@company.com",
  role: "end_user"
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

function projectRecord(id, ownerUserId) {
  return { id, ownerUserId };
}

function publishInput({ id, appId, ownerUserId, name }) {
  const project = {
    id,
    name,
    status: "draft",
    ownerUserId,
    appType: "Workflow App",
    businessProblem: "Employees need a self-service workflow",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager"],
    dataSensitivity: "internal",
    appId,
    createdAt: "2026-08-27T00:00:00.000Z"
  };
  return {
    project,
    baseline: {
      id: `prdver_${id}`,
      projectId: id,
      version: "1.0",
      status: "baseline",
      isBaseline: true,
      sourcePrompt: "Create a PRD.",
      changeSummary: "Baseline confirmed",
      generatedBy: { scenario: "prd_generation", providerId: "aip_openai", model: "gpt-4.1" },
      sections: [{ id: `prdsec_${id}`, key: "overview", title: "Overview", body: "Baseline", order: 1 }],
      createdByUserId: ownerUserId,
      createdAt: "2026-08-27T00:00:00.000Z"
    },
    preview: {
      id: `preview_${id}`,
      projectId: id,
      version: "preview-0001",
      summary: "Preview ready",
      device: "desktop",
      screenTitle: name,
      highlights: ["Ready"],
      createdAt: "2026-08-27T00:00:00.000Z"
    }
  };
}

test("registry persistence enforces project ownership before checking a subdomain", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      projects: [
        projectRecord("prj_people", creator.id),
        projectRecord("prj_other", otherCreator.id)
      ],
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
    (error) => error instanceof PermissionError && error.statusCode === 403
  );
  await assert.rejects(
    () => service.assertSubdomainAvailable(endUser, "prj_unknown", "people-ops"),
    (error) => error instanceof PermissionError && error.statusCode === 403
  );
  await assert.rejects(
    () => service.assertSubdomainAvailable(otherCreator, "prj_other", "people-ops"),
    (error) => {
      assert.ok(error instanceof SubdomainConflictError);
      assert.equal(error.code, "SUBDOMAIN_TAKEN");
      assert.equal(error.status, 409);
      return true;
    }
  );
});

test("conflicting repository publish leaves publish persistence unchanged", async () => {
  const allowed = publishInput({
    id: "prj_people",
    appId: "app_people",
    ownerUserId: creator.id,
    name: "People Operations"
  });
  const blocked = publishInput({
    id: "prj_other",
    appId: "app_other",
    ownerUserId: otherCreator.id,
    name: "Other Operations"
  });
  const client = new MemoryPublishStorePersistenceClient({
    projects: [projectRecord(allowed.project.id, creator.id), projectRecord(blocked.project.id, otherCreator.id)]
  });
  const service = createPublishStoreRepositoryBackedService(client);
  await service.publishApp(creator, { ...allowed, subdomain: "people-ops" });
  const beforeRequests = await client.publishRequest.findMany({});
  const beforeDeployments = await client.deploymentRecord.findMany({ where: {} });

  await assert.rejects(
    () => service.publishApp(otherCreator, { ...blocked, subdomain: "people-ops" }),
    (error) => {
      assert.ok(error instanceof SubdomainConflictError);
      assert.equal(error.code, "SUBDOMAIN_TAKEN");
      return true;
    }
  );

  assert.equal((await client.publishRequest.findMany({})).length, beforeRequests.length);
  assert.equal((await client.appManifest.findFirst({ where: { projectId: blocked.project.id } })), null);
  assert.equal((await client.deploymentRecord.findMany({ where: {} })).length, beforeDeployments.length);
  assert.equal(blocked.project.status, "draft");
  assert.equal(
    await client.appStoreRegistryEntry.findFirst({ where: { projectId: blocked.project.id } }),
    null
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
