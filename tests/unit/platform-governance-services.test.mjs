import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function admin() {
  const services = createPlatformApiServices();
  return {
    services,
    actor: services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" })
  };
}

test("admin can create external provider and masked API key without exposing secret", () => {
  const { services, actor } = admin();
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini"]
  });
  const key = services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Primary Production Key",
    secret: "sk-test-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });

  assert.equal(provider.status, "active");
  assert.equal(key.providerId, provider.id);
  assert.match(key.fingerprint, /^fp_/);
  assert.equal("secret" in key, false);
  assert.equal(JSON.stringify(key).includes("sk-test-secret"), false);
});

test("creator cannot manage AI keys and denial is audited", () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });

  assert.throws(
    () =>
      services.aiGovernance.createProvider(creator, {
        name: "Blocked Provider",
        adapter: "anthropic",
        baseUrl: "https://api.anthropic.com",
        models: ["claude"]
      }),
    /cannot access/
  );

  assert.ok(services.audit.list().some((event) => event.action === "ai.provider.denied"));
});

test("scenario routing resolves primary and fallback provider models", () => {
  const { services, actor } = admin();
  const primary = services.aiGovernance.createProvider(actor, {
    name: "Primary Provider",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });
  const fallback = services.aiGovernance.createProvider(actor, {
    name: "Fallback Provider",
    adapter: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-3-5-sonnet"]
  });

  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: primary.id,
    primaryModel: "gpt-4.1",
    fallbackProviderId: fallback.id,
    fallbackModel: "claude-3-5-sonnet"
  });

  const route = services.aiGovernance.resolveRoute("prd_generation");

  assert.equal(route.primary.providerId, primary.id);
  assert.equal(route.fallback?.providerId, fallback.id);
});

test("quota blocks before provider call and records no provider call", () => {
  const { services, actor } = admin();

  services.aiGovernance.configureQuota(actor, {
    scope: "organization",
    dailyLimit: 1000,
    monthlyLimit: 5000,
    warningThreshold: 800,
    hardStop: true,
    usedToday: 1000
  });

  const decision = services.aiGovernance.checkQuota("organization", 1);

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "quota_exceeded");
  assert.equal(services.aiGovernance.providerCallCount(), 0);
});

test("guardrail keyword and mock policy classifier return allow warn and block with events", () => {
  const { services, actor } = admin();

  services.guardrails.createRule(actor, {
    name: "Block payroll export",
    type: "keyword",
    pattern: "payroll export",
    severity: "high",
    action: "block",
    scope: "organization"
  });

  const allowed = services.guardrails.testPrompt(actor, {
    prompt: "Draft a leave request form",
    scenario: "prd_generation"
  });
  const warned = services.guardrails.testPrompt(actor, {
    prompt: "Summarize confidential policy wording",
    scenario: "prd_generation"
  });
  const blocked = services.guardrails.testPrompt(actor, {
    prompt: "Create payroll export for all employees",
    scenario: "prd_generation"
  });

  assert.equal(allowed.decision, "allow");
  assert.equal(warned.decision, "warn");
  assert.equal(blocked.decision, "block");
  assert.equal(blocked.matchedRule?.name, "Block payroll export");
  assert.ok(services.guardrails.listEvents().some((event) => event.decision === "block"));
});
