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

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

function createPersistentServices(
  coreClient,
  aiClient,
  prdClient,
  workspaceClient,
  publishStoreClient
) {
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(aiClient),
    prdPersistence: createPrdRepositoryBackedService(prdClient),
    workspacePersistence: createWorkspaceRepositoryBackedService(workspaceClient),
    publishStorePersistence: createPublishStoreRepositoryBackedService(publishStoreClient)
  };
  seedLegacyAiGatewayRoutes(services);
  return services;
}

function seedLegacyAiGatewayRoutes(services) {
  const admin = services.auth.resolveCurrentUser(adminHeaders);
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Publish Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Publish Runtime Key",
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

async function createProjectBaselineAndPreview(services) {
  const project = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Publish Persisted",
      appType: "Workflow App",
      businessProblem: "Employees need persisted publish and ticket state",
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
  return project.body.data;
}

test("runtime memory persistence keeps publish registry access and tickets across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const publishStoreClient = new MemoryPublishStorePersistenceClient();
  const firstServices = createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient
  );
  const project = await createProjectBaselineAndPreview(firstServices);

  const accessSnapshot = await executePlatformApiRequestAsync(firstServices, {
    method: "GET",
    path: `/projects/${project.id}/app/users`,
    headers: creatorHeaders
  });
  assert.equal(accessSnapshot.status, 200);
  assert.ok(accessSnapshot.body.data.roles.some((role) => role.key === "employee"));

  const review = await executePlatformApiRequestAsync(firstServices, {
    method: "GET",
    path: `/projects/${project.id}/publish/review`,
    headers: creatorHeaders
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.data.ready, true);

  const publish = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/projects/${project.id}/publish`,
    headers: creatorHeaders
  });
  assert.equal(publish.status, 201);
  assert.equal(publish.body.data.registryEntry.slug, project.appId);

  const access = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/store/apps/${project.appId}/access-requests`,
    headers: endUserHeaders,
    body: { requestedRoleKey: "manager", reason: "Need approval access", department: "HR" }
  });
  assert.equal(access.status, 201);

  const ticket = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/store/apps/${project.appId}/tickets`,
    headers: endUserHeaders,
    body: {
      type: "bug",
      priority: "high",
      title: "WFH leave type missing",
      description: "The WFH option is not visible on mobile.",
      deviceInfo: "iPhone Safari"
    }
  });
  assert.equal(ticket.status, 201);
  assert.equal(JSON.stringify(ticket.body).includes("secret-that-must-not-return"), false);

  const recreatedServices = createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient
  );
  const registry = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/app-store/registry",
    headers: creatorHeaders
  });
  const storeHome = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });
  const ticketStatus = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/store/tickets/${ticket.body.data.id}`,
    headers: endUserHeaders
  });
  const inbox = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/creator/projects/${project.id}/tickets`,
    headers: creatorHeaders
  });
  const recreatedAccessSnapshot = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/projects/${project.id}/app/users`,
    headers: creatorHeaders
  });

  assert.equal(registry.status, 200);
  assert.ok(registry.body.data.some((entry) => entry.slug === project.appId));
  assert.equal(storeHome.status, 200);
  assert.ok(
    storeHome.body.data.availableApps.some(
      (app) => app.slug === project.appId && app.accessStatus === "active"
    )
  );
  assert.ok(
    recreatedAccessSnapshot.body.data.accessRequests.some(
      (request) => request.id === access.body.data.id && request.status === "pending"
    )
  );
  assert.equal(ticketStatus.status, 200);
  assert.equal(ticketStatus.body.data.ticketNumber, "TKT-0001");
  assert.ok(ticketStatus.body.data.timeline.some((entry) => entry.status === "submitted"));
  assert.equal(inbox.status, 200);
  assert.ok(inbox.body.data.some((item) => item.id === ticket.body.data.id));
});
