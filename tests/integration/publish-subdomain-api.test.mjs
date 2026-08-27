import test from "node:test";
import assert from "node:assert/strict";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const {
  createRuntimePlatformApiServices,
  executePlatformApiRequestAsync,
  resolvePublishAccessUrlConfig
} = await import("../../apps/platform-api/src/app-factory.ts");
const { MemoryPublishStorePersistenceClient, createPublishStoreRepositoryBackedService } =
  await import("../../apps/platform-api/src/persistence/publish-store-repositories.ts");
const { isSubdomainUniqueRace } =
  await import("../../apps/platform-api/src/persistence/publish-store-publish-transaction.ts");

const CREATOR_HEADERS = { "x-mock-user-email": "creator@company.com" };

async function createReadyProject(services, name) {
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: CREATOR_HEADERS,
    body: { name }
  });
  const project = created.body.data;
  const actor = await services.corePersistence.getUserByEmail("creator@company.com");
  const baseline = await services.prdPersistence.ensureInitialBaseline(actor, project, {
    sourcePrompt: `Build ${name}`
  });
  await services.workspacePersistence.submitPrompt(actor, {
    project,
    baseline,
    prompt: `Create the ${name} interface`,
    guardrail: { decision: "allow", eventId: `gre_${project.id}` },
    route: { providerId: "test-provider", model: "test-model" },
    tokensUsed: 10
  });
  return project;
}

test("publish access URL configuration is derived from trusted server runtime settings", () => {
  assert.deepEqual(resolvePublishAccessUrlConfig({}), {
    baseDomain: "localhost",
    secure: false,
    port: 9800
  });
  assert.deepEqual(
    resolvePublishAccessUrlConfig({
      EVCP_APP_SUBDOMAIN_BASE_DOMAIN: "Apps.Example.Test"
    }),
    {
      baseDomain: "apps.example.test",
      secure: true
    }
  );
});

test("only a Prisma subdomain unique race maps to the public subdomain conflict", () => {
  assert.equal(isSubdomainUniqueRace({ code: "P2002", meta: { target: ["subdomain"] } }), true);
  assert.equal(isSubdomainUniqueRace({ code: "P2002", meta: { target: ["slug"] } }), false);
  assert.equal(isSubdomainUniqueRace({ code: "P2002" }), false);
});

test("publish review exposes the trusted server access URL configuration", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory",
    EVCP_APP_SUBDOMAIN_BASE_DOMAIN: "apps.example.test"
  });
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: CREATOR_HEADERS,
    body: { name: "People Operations" }
  });
  const project = created.body.data;
  const actor = await services.corePersistence.getUserByEmail("creator@company.com");
  await services.prdPersistence.ensureInitialBaseline(actor, project, {
    sourcePrompt: "Build a people operations workflow"
  });

  const review = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: `/projects/${project.id}/publish/review`,
    headers: CREATOR_HEADERS
  });

  assert.equal(review.status, 200);
  assert.deepEqual(review.body.data.accessUrlConfig, {
    baseDomain: "apps.example.test",
    secure: true
  });
});

test("App Store API rejects an invalid subdomain without creating registry state", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory"
  });
  const project = await createReadyProject(services, "People Operations");

  const response = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "Admin" }
  });
  const registry = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/app-store/registry",
    headers: CREATOR_HEADERS
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "SUBDOMAIN_INVALID");
  assert.deepEqual(registry.body.data, []);
});

test("App Store API maps a taken subdomain to a stable conflict and preserves its owner", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory"
  });
  const firstProject = await createReadyProject(services, "People Operations");
  const secondProject = await createReadyProject(services, "Finance Operations");
  services.publishStorePersistence = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      projects: [
        { id: firstProject.id, ownerUserId: firstProject.ownerUserId },
        { id: secondProject.id, ownerUserId: secondProject.ownerUserId }
      ]
    })
  );
  const first = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${firstProject.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "shared-ops" }
  });
  const publishAudits = await services.corePersistence.filterAudit({
    action: "app.publish.completed"
  });

  const conflict = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${secondProject.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "shared-ops" }
  });
  const registry = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/app-store/registry",
    headers: CREATOR_HEADERS
  });

  assert.equal(first.status, 201, JSON.stringify(first));
  assert.equal(first.body.data.registryEntry.subdomainUrl, "http://shared-ops.localhost:9800");
  assert.deepEqual(
    publishAudits[0].metadata,
    {
      projectId: firstProject.id,
      deploymentId: first.body.data.deployment.id,
      registryEntryId: first.body.data.registryEntry.id,
      manifestVersion: first.body.data.manifest.manifestVersion,
      subdomain: "shared-ops",
      route: first.body.data.registryEntry.route,
      subdomainUrl: "http://shared-ops.localhost:9800"
    }
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "SUBDOMAIN_TAKEN");
  assert.equal(conflict.body.error.message, "This subdomain is already in use.");
  assert.equal(registry.body.data.length, 1);
  assert.equal(registry.body.data[0].projectId, firstProject.id);
  assert.equal(registry.body.data[0].subdomain, "shared-ops");
});

test("a post-commit audit failure keeps the publish successful and runtime aligned", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory"
  });
  const project = await createReadyProject(services, "Audit Resilient Operations");
  services.publishStorePersistence = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      projects: [{ id: project.id, ownerUserId: project.ownerUserId }]
    })
  );
  services.corePersistence.recordAudit = async () => {
    throw new Error("launch-grant-secret-must-not-escape");
  };
  const runtimeDeployment = {
    id: "wdep_audit_success",
    projectId: project.id,
    slug: "audit-resilient-operations",
    environment: "production",
    revision: 3,
    commitSha: "abc123",
    imageTag: "app:abc123",
    imageDigest: "sha256:abc123",
    containerId: "container-audit-success",
    containerName: "app-audit-success",
    publishedByUserId: "usr_creator",
    healthStatus: "healthy",
    createdAt: "2026-08-27T00:00:00.000Z"
  };

  const response = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "audit-resilient", runtimeDeployment }
  });
  const registry = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/app-store/registry",
    headers: CREATOR_HEADERS
  });

  assert.equal(response.status, 201, JSON.stringify(response));
  assert.equal(response.body.data.deployment.deploymentRevisionId, runtimeDeployment.id);
  assert.equal(registry.body.data[0].deploymentId, response.body.data.deployment.id);
  assert.equal(registry.body.data[0].subdomain, "audit-resilient");
  const auditFailure = services.audit
    .list()
    .find((event) => event.action === "audit.persistence_failed");
  assert.equal(auditFailure?.resourceId, response.body.data.publishRequest.id);
  assert.equal(auditFailure?.metadata.attemptedAction, "app.publish.completed");
  assert.equal(JSON.stringify(auditFailure).includes("launch-grant-secret-must-not-escape"), false);
});

test("a Prisma subdomain race preserves the previous registry deployment and hides database details", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory"
  });
  const project = await createReadyProject(services, "People Operations");
  services.publishStorePersistence = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      projects: [{ id: project.id, ownerUserId: project.ownerUserId }]
    })
  );
  let transactionCalls = 0;
  services.publishStorePersistence.client.$transaction = async (operation) => {
    transactionCalls += 1;
    return operation(services.publishStorePersistence.client);
  };
  const first = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "people-old" }
  });
  const previousRegistry = first.body.data.registryEntry;
  const originalUpsert = services.publishStorePersistence.client.appStoreRegistryEntry.upsert;
  services.publishStorePersistence.client.appStoreRegistryEntry.upsert = async () => {
    throw Object.assign(new Error("Unique constraint failed on private database row 42"), {
      code: "P2002",
      meta: { target: ["subdomain"] }
    });
  };

  const conflict = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "people-new" }
  });
  const registry = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/app-store/registry",
    headers: CREATOR_HEADERS
  });
  services.publishStorePersistence.client.appStoreRegistryEntry.upsert = originalUpsert;

  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, {
    ok: false,
    error: {
      code: "SUBDOMAIN_TAKEN",
      message: "This subdomain is already in use.",
      traceId: undefined
    }
  });
  assert.equal(registry.body.data.length, 1);
  assert.equal(registry.body.data[0].subdomain, previousRegistry.subdomain);
  assert.equal(registry.body.data[0].deploymentId, previousRegistry.deploymentId);
  assert.equal(transactionCalls, 2);
});
