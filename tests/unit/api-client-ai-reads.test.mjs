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

test("listProviderModelCatalog POSTs baseUrl to /ai/provider-catalog", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ models: [{ id: "openai/gpt-4.1", name: "GPT-4.1" }] })), { status: 200 });
    }
  });

  const catalog = await client.listProviderModelCatalog("https://openrouter.ai/api/v1");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/provider-catalog"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(catalog.models[0].id, "openai/gpt-4.1");
});

test("setAiProviderStatus POSTs providerId and status to /ai/providers/status", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ id: "prov_1", status: "disabled" })), { status: 200 });
    }
  });

  const provider = await client.setAiProviderStatus("prov_1", "disabled");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/providers/status"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.providerId, "prov_1");
  assert.equal(observed[0].body.status, "disabled");
  assert.equal(provider.status, "disabled");
});

test("deleteAiProvider POSTs providerId to /ai/providers/delete", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ id: "prov_1" })), { status: 200 });
    }
  });

  const result = await client.deleteAiProvider("prov_1");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/providers/delete"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.providerId, "prov_1");
  assert.equal(result.id, "prov_1");
});

test("setAiApiKeyStatus POSTs keyId and status to /ai/api-keys/status", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ id: "key_1", status: "disabled" })), { status: 200 });
    }
  });

  const key = await client.setAiApiKeyStatus("key_1", "disabled");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/api-keys/status"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.keyId, "key_1");
  assert.equal(observed[0].body.status, "disabled");
  assert.equal(key.status, "disabled");
});

test("deleteAiApiKey POSTs keyId to /ai/api-keys/delete", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ id: "key_1" })), { status: 200 });
    }
  });

  const result = await client.deleteAiApiKey("key_1");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/api-keys/delete"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.keyId, "key_1");
  assert.equal(result.id, "key_1");
});
