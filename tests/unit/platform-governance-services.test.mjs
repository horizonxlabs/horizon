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

test("AI gateway invokes OpenAI-compatible adapter in dry-run mode and records usage", () => {
  const { services, actor } = admin();
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Gateway",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Gateway Key",
    secret: "sk-live-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  const result = services.aiGovernance.invokeCompletion(actor, {
    projectId: "prj_test",
    scenario: "prd_generation",
    prompt: "Create a governed leave management PRD",
    requestedTokens: 20,
    guardrailDecision: "allow",
    dryRun: true
  });
  const usage = services.aiGovernance.listUsageLogs()[0];

  assert.equal(result.status, "succeeded");
  assert.equal(result.providerId, provider.id);
  assert.equal(result.adapter, "openai");
  assert.match(result.text, /AI Gateway dry-run response/);
  assert.equal(services.aiGovernance.providerCallCount(), 1);
  assert.equal(usage.status, "succeeded");
  assert.equal(usage.prompt.includes("leave management"), true);
  assert.match(usage.promptFingerprint, /^fp_/);
  assert.equal(JSON.stringify(usage).includes("sk-live-secret"), false);
});

test("AI gateway invokes live OpenAI-compatible transport without leaking secrets", () => {
  const calls = [];
  const services = createPlatformApiServices({
    aiGateway: {
      fetcher: (request) => {
        calls.push(request);
        return {
          status: 200,
          body: {
            choices: [{ message: { content: "Live provider PRD response" } }],
            usage: { total_tokens: 37 }
          }
        };
      }
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Live Gateway",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Live Gateway Key",
    secret: "sk-live-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  const result = services.aiGovernance.invokeCompletion(actor, {
    projectId: "prj_live",
    scenario: "prd_generation",
    prompt: "Create a governed leave management PRD",
    requestedTokens: 20,
    guardrailDecision: "allow",
    dryRun: false
  });
  const usage = services.aiGovernance.listUsageLogs()[0];

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[0].headers.authorization, "Bearer sk-live-secret-that-must-not-leak");
  assert.equal(result.text, "Live provider PRD response");
  assert.equal(result.tokensUsed, 37);
  assert.equal(result.status, "succeeded");
  assert.equal(usage.tokensUsed, 37);
  assert.equal(usage.reason, undefined);
  assert.equal(JSON.stringify(result).includes("sk-live-secret"), false);
  assert.equal(JSON.stringify(usage).includes("sk-live-secret"), false);
  assert.equal(JSON.stringify(services.audit.list()).includes("sk-live-secret"), false);
});

test("AI gateway maps live provider errors without leaking request secrets", () => {
  const services = createPlatformApiServices({
    aiGateway: {
      fetcher: () => ({
        status: 429,
        body: {
          error: {
            message: "rate limit exceeded for token sk-live-secret-that-must-not-leak",
            type: "rate_limit_exceeded"
          }
        }
      })
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Rate Limited",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Live Gateway Key",
    secret: "sk-live-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  assert.throws(
    () =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId: "prj_live",
        scenario: "prd_generation",
        prompt: "Create a governed leave management PRD",
        guardrailDecision: "allow",
        dryRun: false
      }),
    (error) => {
      assert.match(error.message, /AI provider call failed/);
      assert.match(error.message, /rate_limit_exceeded/);
      assert.doesNotMatch(error.message, /sk-live-secret/);
      return true;
    }
  );
  const usage = services.aiGovernance.listUsageLogs()[0];
  assert.equal(usage.status, "failed");
  assert.doesNotMatch(usage.reason, /sk-live-secret/);
});

test("AI gateway blocks guardrail and quota before adapter call", () => {
  const { services, actor } = admin();
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Guarded",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Guarded Key",
    secret: "sk-live-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  assert.throws(
    () =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId: "prj_test",
        scenario: "prd_generation",
        prompt: "payroll export",
        guardrailDecision: "block",
        dryRun: true
      }),
    /blocked by guardrail/
  );
  assert.equal(services.aiGovernance.providerCallCount(), 0);

  services.aiGovernance.configureQuota(actor, {
    scope: "creator",
    dailyLimit: 1,
    monthlyLimit: 1,
    warningThreshold: 1,
    hardStop: true,
    usedToday: 1
  });

  assert.throws(
    () =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId: "prj_test",
        scenario: "prd_generation",
        prompt: "Create a PRD",
        requestedTokens: 10,
        guardrailDecision: "allow",
        dryRun: true
      }),
    /quota exceeded/i
  );
  assert.equal(services.aiGovernance.providerCallCount(), 0);
  assert.equal(services.aiGovernance.listUsageLogs().filter((usage) => usage.status === "blocked").length, 2);
});

test("AI gateway uses deterministic fallback only when route fallback policy allows it", () => {
  const { services, actor } = admin();
  const primary = services.aiGovernance.createProvider(actor, {
    name: "Failing OpenAI",
    adapter: "openai",
    baseUrl: "mock://fail-primary",
    models: ["gpt-4.1"]
  });
  const fallback = services.aiGovernance.createProvider(actor, {
    name: "Fallback OpenAI",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  for (const provider of [primary, fallback]) {
    services.aiGovernance.createApiKey(actor, {
      providerId: provider.id,
      name: "Gateway Key",
      secret: `sk-${provider.id}-secret-that-must-not-leak`,
      usageMode: provider.id === fallback.id ? "fallback" : "production",
      quotaTokens: 100000,
      fallbackPriority: 1
    });
  }
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: primary.id,
    primaryModel: "gpt-4.1",
    fallbackProviderId: fallback.id,
    fallbackModel: "gpt-4.1-mini"
  });

  const result = services.aiGovernance.invokeCompletion(actor, {
    projectId: "prj_test",
    scenario: "prd_generation",
    prompt: "Create a PRD",
    guardrailDecision: "allow",
    dryRun: true,
    allowDeterministicFallback: true,
    deterministicFallbackText: "Fallback PRD response"
  });

  assert.equal(result.status, "fallback");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.providerId, fallback.id);
  assert.equal(result.text, "Fallback PRD response");
  assert.equal(services.aiGovernance.providerCallCount(), 1);
  assert.ok(services.audit.list().some((event) => event.action === "ai.gateway.fallback_used"));
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
