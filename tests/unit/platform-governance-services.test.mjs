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

test("AI gateway retries retryable live provider responses before succeeding", () => {
  const calls = [];
  const services = createPlatformApiServices({
    aiGateway: {
      maxRetries: 2,
      retryableStatusCodes: [429, 500],
      fetcher: (request) => {
        calls.push(request);
        if (calls.length === 1) {
          return {
            status: 429,
            body: { error: { message: "rate limited once", type: "rate_limit_exceeded" } }
          };
        }
        return {
          status: 200,
          body: {
            choices: [{ message: { content: "Retried provider response" } }],
            usage: { total_tokens: 29 }
          }
        };
      }
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Retry Runtime",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Retry Runtime Key",
    secret: "sk-retry-secret-that-must-not-leak",
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
    projectId: "prj_retry",
    scenario: "prd_generation",
    prompt: "Create a governed PRD after one retry",
    guardrailDecision: "allow",
    dryRun: false
  });

  assert.equal(calls.length, 2);
  assert.equal(result.text, "Retried provider response");
  assert.equal(result.tokensUsed, 29);
  assert.equal(services.aiGovernance.listUsageLogs()[0].status, "succeeded");
});

test("AI gateway exhausts retries and sanitizes live transport failure evidence", () => {
  const calls = [];
  const services = createPlatformApiServices({
    aiGateway: {
      maxRetries: 1,
      retryableStatusCodes: [500],
      fetcher: () => {
        calls.push("attempt");
        throw new Error("socket closed while using sk-transport-secret-that-must-not-leak");
      }
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Retry Exhausted",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Retry Exhausted Key",
    secret: "sk-transport-secret-that-must-not-leak",
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
        projectId: "prj_retry_exhausted",
        scenario: "prd_generation",
        prompt: "Create a PRD with retry exhaustion",
        guardrailDecision: "allow",
        dryRun: false
      }),
    (error) => {
      assert.match(error.message, /attempts=2/);
      assert.doesNotMatch(error.message, /sk-transport-secret/);
      return true;
    }
  );

  assert.equal(calls.length, 2);
  const usage = services.aiGovernance.listUsageLogs()[0];
  assert.equal(usage.status, "failed");
  assert.match(usage.reason, /attempts=2/);
  assert.doesNotMatch(usage.reason, /sk-transport-secret/);
  assert.equal(JSON.stringify(services.audit.list()).includes("sk-transport-secret"), false);
});

test("AI gateway opens circuit after repeated live failures and fails fast during cooldown", () => {
  let now = 1_000;
  let calls = 0;
  const services = createPlatformApiServices({
    aiGateway: {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 2, cooldownMs: 60_000 },
      now: () => now,
      fetcher: () => {
        calls += 1;
        return {
          status: 500,
          body: { error: { message: "provider unavailable", type: "server_error" } }
        };
      }
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Circuit Runtime",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Circuit Runtime Key",
    secret: "sk-circuit-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  for (const projectId of ["prj_circuit_1", "prj_circuit_2"]) {
    assert.throws(() =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId,
        scenario: "prd_generation",
        prompt: "Create a PRD while provider is down",
        guardrailDecision: "allow",
        dryRun: false
      })
    );
  }

  assert.equal(calls, 2);
  assert.throws(
    () =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId: "prj_circuit_fast_fail",
        scenario: "prd_generation",
        prompt: "Create a PRD while circuit is open",
        guardrailDecision: "allow",
        dryRun: false
      }),
    /circuit open/
  );
  assert.equal(calls, 2);
  assert.equal(services.aiGovernance.listUsageLogs().at(-1).reason.includes("circuit open"), true);
});

test("AI gateway retries provider after circuit cooldown and closes circuit on success", () => {
  let now = 1_000;
  let calls = 0;
  const services = createPlatformApiServices({
    aiGateway: {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000 },
      now: () => now,
      fetcher: () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 500,
            body: { error: { message: "temporary outage", type: "server_error" } }
          };
        }
        return {
          status: 200,
          body: {
            choices: [{ message: { content: "Recovered provider response" } }],
            usage: { total_tokens: 31 }
          }
        };
      }
    }
  });
  const actor = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Circuit Recovery",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Circuit Recovery Key",
    secret: "sk-recovery-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  assert.throws(() =>
    services.aiGovernance.invokeCompletion(actor, {
      projectId: "prj_recovery_fail",
      scenario: "prd_generation",
      prompt: "Create a PRD before recovery",
      guardrailDecision: "allow",
      dryRun: false
    })
  );
  assert.throws(
    () =>
      services.aiGovernance.invokeCompletion(actor, {
        projectId: "prj_recovery_fast_fail",
        scenario: "prd_generation",
        prompt: "Create a PRD before cooldown",
        guardrailDecision: "allow",
        dryRun: false
      }),
    /circuit open/
  );
  assert.equal(calls, 1);

  now += 60_001;
  const result = services.aiGovernance.invokeCompletion(actor, {
    projectId: "prj_recovery_success",
    scenario: "prd_generation",
    prompt: "Create a PRD after cooldown",
    guardrailDecision: "allow",
    dryRun: false
  });

  assert.equal(calls, 2);
  assert.equal(result.text, "Recovered provider response");
  assert.equal(result.status, "succeeded");
  assert.equal(services.aiGovernance.listUsageLogs().at(-1).status, "succeeded");
});

test("admin provider test call returns sanitized adapter evidence", () => {
  const { services, actor } = admin();
  const provider = services.aiGovernance.createProvider(actor, {
    name: "OpenAI Test Call",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(actor, {
    providerId: provider.id,
    name: "Test Call Key",
    secret: "sk-test-call-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(actor, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  const result = services.aiGovernance.testProviderCall(actor, {
    scenario: "prd_generation",
    prompt: "Validate provider before Creator use",
    dryRun: true
  });

  assert.equal(result.providerId, provider.id);
  assert.equal(result.providerName, "OpenAI Test Call");
  assert.equal(result.model, "gpt-4.1-mini");
  assert.equal(result.status, "succeeded");
  assert.equal(result.fallbackUsed, false);
  assert.match(result.outputExcerpt, /AI Gateway dry-run response/);
  assert.match(result.usageLogId, /^aigw_/);
  assert.equal(JSON.stringify(result).includes("sk-test-call-secret"), false);
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
