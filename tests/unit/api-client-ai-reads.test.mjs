import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, success } = await import("../../packages/api-client/src/index.ts");

test("listAiScenarioRoutes issues a GET request to /ai/routes", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(JSON.stringify(success([{ scenario: "prd_generation", primary: { providerId: "prov_1", model: "gpt-4" } }])), {
        status: 200
      });
    }
  });

  const routes = await client.listAiScenarioRoutes();

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/routes"), `expected url to end with /ai/routes, got ${observed[0].url}`);
  assert.equal(observed[0].method, "GET");
  assert.equal(routes[0].scenario, "prd_generation");
});

test("listAiQuotas issues a GET request to /ai/quotas", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(
        JSON.stringify(success([{ scope: "organization", dailyLimit: 100000, monthlyLimit: 2000000, warningThreshold: 80, hardStop: false, usedToday: 100 }])),
        { status: 200 }
      );
    }
  });

  const quotas = await client.listAiQuotas();

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/quotas"), `expected url to end with /ai/quotas, got ${observed[0].url}`);
  assert.equal(observed[0].method, "GET");
  assert.equal(quotas[0].scope, "organization");
});
