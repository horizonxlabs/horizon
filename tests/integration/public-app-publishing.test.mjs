import assert from "node:assert/strict";
import test from "node:test";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { createRuntimePlatformApiServices, executePlatformApiRequestAsync } =
  await import("../../apps/platform-api/src/app-factory.ts");
const { createInternalPublishPersistenceRequest } =
  await import("../../apps/platform-api/src/publish/app-store-publish-runtime.ts");
const { MemoryPublishStorePersistenceClient, createPublishStoreRepositoryBackedService } =
  await import("../../apps/platform-api/src/persistence/publish-store-repositories.ts");

const CREATOR_HEADERS = { "x-mock-user-email": "creator@company.com" };

async function createReadyProject(services, name) {
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST", path: "/projects", headers: CREATOR_HEADERS, body: { name }
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

test("public visibility persists across an internal runtime republish", async () => {
  const services = await createRuntimePlatformApiServices({
    EVCP_CORE_PERSISTENCE: "memory",
    EVCP_APP_SUBDOMAIN_BASE_DOMAIN: "gethorizon.org"
  });
  const project = await createReadyProject(services, "IoT for Industry");
  services.publishStorePersistence = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient({
      projects: [{ id: project.id, ownerUserId: project.ownerUserId }]
    }),
    { baseDomain: "gethorizon.org", secure: true }
  );

  const first = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "iot", visibility: "public" }
  });
  assert.equal(first.status, 201, JSON.stringify(first));
  assert.equal(first.body.data.registryEntry.visibility, "public");
  assert.equal(first.body.data.registryEntry.accessMode, "public");
  assert.equal(first.body.data.registryEntry.subdomainUrl, "https://iot.gethorizon.org");

  const republished = await executePlatformApiRequestAsync(
    services,
    createInternalPublishPersistenceRequest({
      headers: CREATOR_HEADERS,
      projectId: project.id,
      deployment: {
        id: "wdep_iot_republish",
        projectId: project.id,
        slug: "iot-for-industry",
        environment: "production",
        revision: 2,
        commitSha: "iot-sha-2",
        imageTag: "iot:sha-2",
        imageDigest: "sha256:iot-sha-2",
        containerId: "container-iot-2",
        containerName: "app-iot-2",
        publishedByUserId: "usr_creator",
        healthStatus: "healthy",
        createdAt: "2026-09-04T00:00:00.000Z"
      }
    })
  );

  assert.equal(republished.status, 201, JSON.stringify(republished));
  assert.equal(republished.body.data.registryEntry.visibility, "public");
  assert.equal(republished.body.data.registryEntry.subdomain, "iot");
});

test("an unknown visibility fails closed without publishing registry state", async () => {
  const services = await createRuntimePlatformApiServices({ EVCP_CORE_PERSISTENCE: "memory" });
  const project = await createReadyProject(services, "Visibility Validation");
  const response = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: CREATOR_HEADERS,
    body: { subdomain: "visibility-validation", visibility: "anonymous" }
  });
  const registry = await executePlatformApiRequestAsync(services, {
    method: "GET", path: "/app-store/registry", headers: CREATOR_HEADERS
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VISIBILITY_INVALID");
  assert.deepEqual(registry.body.data, []);
});
