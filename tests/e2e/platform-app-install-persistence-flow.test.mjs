import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import { executePlatformApiRequestAsync } from "../../apps/platform-api/src/app-factory.ts";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/core-repositories.ts";
import { MemoryAiGovernancePersistenceClient } from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";
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
import { createPersistedGovernedAiFixture } from "../helpers/persisted-governed-ai-fixture.ts";

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

async function createPersistentServices(
  coreClient,
  aiClient,
  prdClient,
  workspaceClient,
  publishStoreClient
) {
  const legacyServices = createPlatformApiServices();
  const governedAi = await createPersistedGovernedAiFixture(aiClient, legacyServices.auth.resolveCurrentUser(adminHeaders));
  const services = {
    ...legacyServices,
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: governedAi.service,
    governedAiExecutor: governedAi.executor,
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
    name: "OpenAI Install Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Install Runtime Key",
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

async function createPublishedProject(services) {
  const project = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Install Persisted",
      appType: "Workflow App",
      businessProblem: "Employees need explicit app installation state",
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

async function grantEndUserAccess(services, project) {
  const request = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/store/apps/${project.appId}/access-requests`,
    headers: endUserHeaders,
    body: {
      requestedRoleKey: "employee",
      reason: "Install the published app"
    }
  });
  assert.equal(request.status, 201);

  const decision = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.id}/app/access-requests/decision`,
    headers: creatorHeaders,
    body: { requestId: request.body.data.id, decision: "approved" }
  });
  assert.equal(decision.status, 200);
}

test("runtime memory persistence keeps App Store install lifecycle across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const publishStoreClient = new MemoryPublishStorePersistenceClient();
  const firstServices = await createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient
  );
  const project = await createPublishedProject(firstServices);

  const beforeInstall = await executePlatformApiRequestAsync(firstServices, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });
  assert.equal(beforeInstall.status, 200);
  assert.equal(
    beforeInstall.body.data.myApps.some((app) => app.slug === project.appId),
    false
  );
  assert.ok(
    beforeInstall.body.data.availableApps.some(
      (app) => app.slug === project.appId && app.installStatus === "not_installed"
    )
  );

  await grantEndUserAccess(firstServices, project);

  const installed = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/store/apps/${project.appId}/install`,
    headers: endUserHeaders
  });
  assert.equal(installed.status, 201);
  assert.equal(installed.body.data.status, "active");

  const afterInstall = await executePlatformApiRequestAsync(firstServices, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });
  assert.equal(afterInstall.status, 200);
  assert.ok(
    afterInstall.body.data.myApps.some(
      (app) => app.slug === project.appId && app.installStatus === "installed"
    )
  );
  assert.equal(JSON.stringify(afterInstall.body).includes("secret-that-must-not-return"), false);

  const recreatedServices = await createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient,
    publishStoreClient
  );
  const detail = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/store/apps/${project.appId}`,
    headers: endUserHeaders
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.installStatus, "installed");
  assert.ok(detail.body.data.actions.includes("uninstall"));

  const uninstalled = await executePlatformApiRequestAsync(recreatedServices, {
    method: "POST",
    path: `/store/apps/${project.appId}/uninstall`,
    headers: endUserHeaders
  });
  assert.equal(uninstalled.status, 200);
  assert.equal(uninstalled.body.data.status, "disabled");

  const afterUninstall = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });
  assert.equal(afterUninstall.status, 200);
  assert.equal(
    afterUninstall.body.data.myApps.some((app) => app.slug === project.appId),
    false
  );
  assert.ok(
    afterUninstall.body.data.availableApps.some(
      (app) => app.slug === project.appId && app.accessStatus === "active"
    )
  );

  const audits = await executePlatformApiRequestAsync(recreatedServices, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: adminHeaders,
    body: { projectId: project.id, resourceType: "app_installation" }
  });
  assert.equal(audits.status, 200);
  assert.ok(audits.body.data.some((event) => event.action === "store.app.installed"));
  assert.ok(audits.body.data.some((event) => event.action === "store.app.uninstalled"));
});
