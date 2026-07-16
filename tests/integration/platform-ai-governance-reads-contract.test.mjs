import assert from "node:assert/strict";
import { test } from "node:test";
import { executePlatformApiRequestAsync } from "../../apps/platform-api/src/app-factory.ts";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import {
  MemoryAiGovernancePersistenceClient,
  createAiGovernanceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const adminHeaders = { "x-mock-user-email": "admin@company.com" };

function createServices() {
  return {
    ...createPlatformApiServices(),
    aiGovernancePersistence: createAiGovernanceRepositoryBackedService(
      new MemoryAiGovernancePersistenceClient()
    )
  };
}

test("GET /ai/routes and /ai/quotas return persisted governance reads", async () => {
  const services = createServices();

  const provider = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/ai/providers",
    headers: adminHeaders,
    body: {
      name: "OpenAI Reads",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1-mini"]
    }
  });
  assert.equal(provider.status, 201);
  const providerId = provider.body.data.id;

  const routeRes = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/ai/routes",
    headers: adminHeaders,
    body: {
      scenario: "frontend_coding",
      primaryProviderId: providerId,
      primaryModel: "gpt-4.1-mini"
    }
  });
  assert.equal(routeRes.status, 200);

  const quotaRes = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/ai/quotas",
    headers: adminHeaders,
    body: {
      scope: "organization",
      dailyLimit: 1000,
      monthlyLimit: 30000,
      warningThreshold: 900,
      hardStop: true,
      usedToday: 0
    }
  });
  assert.equal(quotaRes.status, 200);

  const routes = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/ai/routes",
    headers: adminHeaders
  });
  assert.equal(routes.status, 200);
  assert.equal(routes.body.ok, true);
  assert.ok(
    routes.body.data.some((route) => route.scenario === "frontend_coding"),
    "expected GET /ai/routes to include the configured frontend_coding route"
  );

  const quotas = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/ai/quotas",
    headers: adminHeaders
  });
  assert.equal(quotas.status, 200);
  assert.equal(quotas.body.ok, true);
  assert.ok(
    quotas.body.data.some((quota) => quota.scope === "organization"),
    "expected GET /ai/quotas to include the configured organization quota"
  );
});
