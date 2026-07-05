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

const adminHeaders = { "x-mock-user-email": "admin@company.com" };

function createPersistentServices(coreClient, aiClient) {
  return {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(aiClient)
  };
}

test("runtime memory persistence keeps AI governance state across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const firstServices = createPersistentServices(coreClient, aiClient);

  const provider = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/ai/providers",
    headers: adminHeaders,
    body: {
      name: "OpenAI Restart Safe",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1-mini"]
    }
  });
  assert.equal(provider.status, 201);

  const key = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/ai/api-keys",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      name: "Restart Safe Key",
      secret: "secret-that-must-not-return",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1
    }
  });
  assert.equal(key.status, 201);
  assert.equal(JSON.stringify(key.body).includes("secret-that-must-not-return"), false);

  await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/ai/routes",
    headers: adminHeaders,
    body: { scenario: "prd_generation", primaryProviderId: provider.body.data.id, primaryModel: "gpt-4.1-mini" }
  });
  await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/ai/quotas",
    headers: adminHeaders,
    body: { scope: "creator", dailyLimit: 1000, monthlyLimit: 30000, warningThreshold: 900, hardStop: true, usedToday: 0 }
  });
  await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/guardrails/rules",
    headers: adminHeaders,
    body: { name: "Block payroll export", type: "keyword", pattern: "payroll export", severity: "high", action: "block", scope: "organization" }
  });
  await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: "/guardrails/test",
    headers: adminHeaders,
    body: { prompt: "Generate payroll export report", scenario: "prd_generation" }
  });

  const recreatedServices = createPersistentServices(coreClient, aiClient);
  const providers = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/ai/providers",
    headers: adminHeaders
  });
  const apiKeys = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/ai/api-keys",
    headers: adminHeaders
  });
  const events = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: "/guardrails/events",
    headers: adminHeaders
  });

  assert.equal(providers.status, 200);
  assert.equal(providers.body.data.some((record) => record.name === "OpenAI Restart Safe"), true);
  assert.equal(apiKeys.body.data.some((record) => record.name === "Restart Safe Key" && !JSON.stringify(record).includes("secret-that-must-not-return")), true);
  assert.equal(events.body.data.some((record) => record.decision === "block" && record.matchedRuleName === "Block payroll export"), true);
});
