import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import { executePlatformApiRequestAsync } from "../../apps/platform-api/src/app-factory.ts";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/core-repositories.ts";
import {
  MemoryAiGovernancePersistenceClient,
  createAiGovernanceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";
import {
  MemoryPrdPersistenceClient,
  createPrdRepositoryBackedService
} from "../../apps/platform-api/src/persistence/prd-repositories.ts";
import {
  MemoryWorkspacePersistenceClient,
  createWorkspaceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/workspace-repositories.ts";
import {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";
import {
  MemoryGeneratedRuntimePersistenceClient,
  createGeneratedRuntimeRepositoryBackedService
} from "../../apps/platform-api/src/persistence/generated-runtime-repositories.ts";

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createPersistentServices(
  coreClient,
  aiClient,
  prdClient,
  workspaceClient,
  publishStoreClient,
  runtimeClient
) {
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(aiClient),
    prdPersistence: createPrdRepositoryBackedService(prdClient),
    workspacePersistence: createWorkspaceRepositoryBackedService(workspaceClient),
    publishStorePersistence: createPublishStoreRepositoryBackedService(publishStoreClient),
    generatedRuntimePersistence: createGeneratedRuntimeRepositoryBackedService(runtimeClient)
  };
  seedLegacyAiGatewayRoutes(services);
  return services;
}

function seedLegacyAiGatewayRoutes(services) {
  const admin = services.auth.resolveCurrentUser(adminHeaders);
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Runtime Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Runtime Evidence Key",
    secret: "secret-that-must-not-return",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  for (const scenario of ["prd_generation", "frontend_coding"]) {
    services.aiGovernance.configureRoute(admin, {
      scenario,
      primaryProviderId: provider.id,
      primaryModel: "gpt-4.1-mini"
    });
  }
  services.aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 30000,
    warningThreshold: 900,
    hardStop: true,
    usedToday: 0
  });
}

async function createPublishedRuntimeProject(services) {
  const project = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Runtime Persisted",
      slug: "leave-runtime-persisted",
      appType: "Workflow App",
      businessProblem: "Employees need persisted runtime evidence",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager"],
      dataSensitivity: "internal"
    }
  });
  assert.equal(project.status, 201);

  const draft = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  assert.equal(draft.status, 201);

  const baseline = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  assert.equal(baseline.status, 200);

  const prompt = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type" }
  });
  assert.equal(prompt.status, 201);

  const publish = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/publish`,
    headers: creatorHeaders
  });
  assert.equal(publish.status, 201);
  return project.body.data;
}

test("runtime memory persistence keeps generated runtime evidence across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const publishStoreClient = new MemoryPublishStorePersistenceClient();
  const runtimeClient = new MemoryGeneratedRuntimePersistenceClient();
  const firstServices = createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient,
    runtimeClient
  );
  const project = await createPublishedRuntimeProject(firstServices);

  const overview = await executePlatformApiRequestAsync(firstServices, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}`,
    headers: adminHeaders
  });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.data.artifactContract.root, "generated-apps/leave-runtime-persisted");
  assert.equal(overview.body.data.container.status, "running");
  assert.equal(overview.body.data.schemaIsolation.schemaName, "app_leave_runtime_persisted");

  const deniedSchema = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/admin/runtime/projects/${project.id}/schema/check`,
    headers: adminHeaders,
    body: { attemptedSchema: "app_payroll", operation: "select" }
  });
  assert.equal(deniedSchema.status, 200);
  assert.equal(deniedSchema.body.data.allowed, false);

  const dryRun = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/admin/runtime/projects/${project.id}/migrations/dry-run`,
    headers: adminHeaders,
    body: {
      migrationId: "mig_drop_leave_balance",
      destructiveChanges: ["drop_column:leave_requests.balance_snapshot"],
      approvalId: ""
    }
  });
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.data.status, "blocked");

  const recreatedServices = createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient,
    runtimeClient
  );
  const health = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}/health`,
    headers: adminHeaders
  });
  const openApi = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}/openapi`,
    headers: adminHeaders
  });
  const recreatedOverview = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}`,
    headers: adminHeaders
  });
  const creatorDenied = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}`,
    headers: creatorHeaders
  });

  assert.equal(health.status, 200);
  assert.equal(health.body.data.health.status, "healthy");
  assert.equal(health.body.data.metrics.requestCount, 128);
  assert.equal(openApi.status, 200);
  assert.equal(openApi.body.data.version, "1.0.0");
  assert.ok(openApi.body.data.paths.includes("/api/leave-requests"));
  assert.equal(recreatedOverview.body.data.deploymentId, overview.body.data.deploymentId);
  assert.equal(recreatedOverview.body.data.migrationDryRun.migrationId, "mig_drop_leave_balance");
  assert.equal(recreatedOverview.body.data.migrationDryRun.status, "blocked");
  assert.equal(creatorDenied.status, 403);
  assert.equal(
    JSON.stringify(recreatedOverview.body).includes("secret-that-must-not-return"),
    false
  );
});
