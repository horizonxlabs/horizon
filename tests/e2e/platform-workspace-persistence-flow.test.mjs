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

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createPersistentServices(coreClient, aiClient, prdClient, workspaceClient) {
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(aiClient),
    prdPersistence: createPrdRepositoryBackedService(prdClient),
    workspacePersistence: createWorkspaceRepositoryBackedService(workspaceClient)
  };
  seedLegacyAiGatewayRoutes(services);
  return services;
}

function seedLegacyAiGatewayRoutes(services) {
  const admin = services.auth.resolveCurrentUser(adminHeaders);
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Workspace Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Workspace Runtime Key",
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

async function createProjectWithBaseline(services) {
  const project = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Workspace Persisted",
      slug: "leave-workspace-persisted",
      appType: "Workflow App",
      businessProblem: "Employees need persisted workspace prompt state",
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
  return project.body.data;
}

test("runtime memory persistence keeps workspace task preview and usage across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const firstServices = createPersistentServices(coreClient, aiClient, prdClient, workspaceClient);
  const project = await createProjectWithBaseline(firstServices);

  const prompt = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/projects/${project.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type" }
  });
  assert.equal(prompt.status, 201);
  assert.equal(prompt.body.data.task.status, "ready");
  assert.equal(prompt.body.data.usage.tokensUsed, 120);
  assert.equal(JSON.stringify(prompt.body).includes("secret-that-must-not-return"), false);

  const recreatedServices = createPersistentServices(coreClient, aiClient, prdClient, workspaceClient);
  const snapshot = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/projects/${project.id}/workspace`,
    headers: creatorHeaders
  });
  const refreshed = await executePlatformApiRequestAsync(recreatedServices, {
    method: "POST",
    path: `/projects/${project.id}/workspace/preview/refresh`,
    headers: creatorHeaders
  });

  assert.equal(snapshot.status, 200);
  assert.match(snapshot.body.data.preview.summary, /WFH leave type/);
  assert.equal(snapshot.body.data.tasks.some((task) => task.id === prompt.body.data.task.id), true);
  assert.equal(snapshot.body.data.usage.some((usage) => usage.id === prompt.body.data.usage.id), true);
  assert.equal(refreshed.body.data.id, snapshot.body.data.preview.id);
});
