import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

test("Sprint 2 API smoke covers provider creation key masking routing quota and guardrail events", () => {
  const services = createPlatformApiServices();

  const provider = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/providers",
    headers: adminHeaders,
    body: {
      name: "OpenAI Production",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1"]
    }
  });
  assert.equal(provider.status, 201);
  assert.equal(provider.body.ok, true);

  const key = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/api-keys",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      name: "Primary Key",
      secret: "sk-e2e-secret",
      usageMode: "production",
      quotaTokens: 5000,
      fallbackPriority: 1
    }
  });
  assert.equal(key.status, 201);
  assert.equal(JSON.stringify(key.body).includes("sk-e2e-secret"), false);

  const route = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/routes",
    headers: adminHeaders,
    body: {
      scenario: "prd_generation",
      primaryProviderId: provider.body.data.id,
      primaryModel: "gpt-4.1"
    }
  });
  assert.equal(route.status, 200);

  const quota = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/quotas",
    headers: adminHeaders,
    body: {
      scope: "organization",
      dailyLimit: 1000,
      monthlyLimit: 5000,
      warningThreshold: 800,
      hardStop: true,
      usedToday: 999
    }
  });
  assert.equal(quota.status, 200);

  executePlatformApiRequest(services, {
    method: "POST",
    path: "/guardrails/rules",
    headers: adminHeaders,
    body: {
      name: "Block payroll export",
      type: "keyword",
      pattern: "payroll export",
      severity: "high",
      action: "block",
      scope: "organization"
    }
  });
  const blocked = executePlatformApiRequest(services, {
    method: "POST",
    path: "/guardrails/test",
    headers: adminHeaders,
    body: {
      prompt: "Generate payroll export report",
      scenario: "prd_generation"
    }
  });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.data.decision, "block");

  const events = executePlatformApiRequest(services, {
    method: "GET",
    path: "/guardrails/events",
    headers: adminHeaders
  });
  assert.ok(events.body.data.some((event) => event.decision === "block"));
});

test("Sprint 2 API denies creator access to AI key management", () => {
  const services = createPlatformApiServices();
  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/providers",
    headers: creatorHeaders,
    body: {
      name: "Creator Provider",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1"]
    }
  });

  assert.equal(denied.status, 403);
  assert.equal(denied.body.ok, false);
});

test("Sprint 2 Admin UI exposes governance screens without plaintext secrets", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "AI Providers & API Keys",
    "Scenario Routing",
    "Token Quota",
    "Guardrail Rules",
    "Test Prompt",
    "Guardrail Events",
    "Fingerprint"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }

  assert.doesNotMatch(adminSource, /sk-[A-Za-z0-9]/);
});
