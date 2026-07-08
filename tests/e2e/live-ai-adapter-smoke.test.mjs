import assert from "node:assert/strict";
import test from "node:test";

const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

test("Live OpenAI-compatible adapter path completes through injected provider fetcher", () => {
  const calls = [];
  const services = createPlatformApiServices({
    aiGateway: {
      fetcher: (request) => {
        calls.push(request);
        return {
          status: 200,
          body: {
            choices: [{ message: { content: "Generated live PRD section" } }],
            usage: { total_tokens: 42 }
          }
        };
      }
    }
  });
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Live Smoke",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Live Smoke Key",
    secret: "sk-live-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });
  services.aiGovernance.configureRoute(admin, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });

  const result = services.aiGovernance.invokeCompletion(admin, {
    projectId: "prj_live_smoke",
    scenario: "prd_generation",
    prompt: "Create a production-ready PRD section",
    guardrailDecision: "allow",
    dryRun: false
  });

  assert.equal(result.text, "Generated live PRD section");
  assert.equal(result.tokensUsed, 42);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "gpt-4.1-mini");
  assert.equal(calls[0].body.messages[0].content, "Create a production-ready PRD section");
  assert.equal(JSON.stringify(result).includes("sk-live-secret"), false);
  assert.equal(
    JSON.stringify(services.aiGovernance.listUsageLogs()).includes("sk-live-secret"),
    false
  );
});
