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
import { createPersistedGovernedAiExecutor } from "../../apps/platform-api/src/ai-governance/execution-runtime.ts";
import {
  MemoryPrdPersistenceClient,
  createPrdRepositoryBackedService
} from "../../apps/platform-api/src/persistence/prd-repositories.ts";

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

async function createPersistentServices(coreClient, aiClient, prdClient) {
  const aiGovernance = createAiGovernanceRepositoryBackedService(aiClient);
  const services = {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: aiGovernance,
    prdPersistence: createPrdRepositoryBackedService(prdClient),
    governedAiExecutor: createPersistedGovernedAiExecutor(aiClient, {
      fetcher: async () => new Response(JSON.stringify({
        choices: [{ message: { content: "Governed AI PRD summary" } }],
        usage: { total_tokens: 137 }
      }), { status: 200, headers: { "content-type": "application/json" } })
    })
  };
  await seedPersistedAiGatewayRoute(aiGovernance, services.auth.resolveCurrentUser(adminHeaders));
  return services;
}

async function seedPersistedAiGatewayRoute(aiGovernance, admin) {
  const provider = await aiGovernance.createProvider(admin, {
    name: "OpenAI PRD Persisted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  await aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "PRD Runtime Key",
    secret: "secret-that-must-not-return",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  await aiGovernance.configureRoute(admin, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });
  await aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 30000,
    warningThreshold: 900,
    hardStop: true,
    usedToday: 0
  });
}

test("runtime memory persistence keeps PRD draft and baseline across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const firstServices = await createPersistentServices(coreClient, aiClient, prdClient);

  const project = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Persisted Runtime",
      slug: "leave-persisted-runtime",
      appType: "Workflow App",
      businessProblem: "Employees need persisted leave PRD evidence",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager"],
      dataSensitivity: "internal"
    }
  });
  assert.equal(project.status, 201);

  const draft = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.version, "0.1");
  assert.equal(draft.body.data.sections.some((section) => section.body.includes("Governed AI PRD summary")), true);
  assert.equal(JSON.stringify(draft.body).includes("secret-that-must-not-return"), false);
  const draftAudit = (await firstServices.corePersistence.filterAudit({
    actorId: "usr_creator",
    action: "prd.draft.generated"
  }))[0];
  assert.equal(typeof draftAudit.metadata.executionId, "string");
  assert.equal(draftAudit.metadata.aiStatus, "succeeded");
  assert.equal(draftAudit.metadata.tokensUsed, 137);

  const baseline = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.data.version, "1.0");

  const recreatedServices = await createPersistentServices(coreClient, aiClient, prdClient);
  const current = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/projects/${project.body.data.id}/prd`,
    headers: creatorHeaders
  });
  const versions = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/projects/${project.body.data.id}/prd/versions`,
    headers: creatorHeaders
  });

  assert.equal(current.status, 200);
  assert.equal(current.body.data.id, baseline.body.data.id);
  assert.equal(
    current.body.data.sections.some((section) => section.body.includes("AI Gateway Summary")),
    true
  );
  assert.equal(versions.status, 200);
  assert.equal(
    versions.body.data.some((version) => version.id === draft.body.data.id),
    true
  );
  assert.equal(
    versions.body.data.some((version) => version.id === baseline.body.data.id),
    true
  );
});
