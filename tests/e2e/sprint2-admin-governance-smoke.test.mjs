import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

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

test("Sprint 2 API supports admin AI provider test-call workflow", () => {
  const services = createPlatformApiServices();
  const provider = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/providers",
    headers: adminHeaders,
    body: {
      name: "OpenAI Test Call",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1-mini"]
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/api-keys",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      name: "Test Call Key",
      secret: "sk-test-call-secret-that-must-not-leak",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/routes",
    headers: adminHeaders,
    body: {
      scenario: "prd_generation",
      primaryProviderId: provider.body.data.id,
      primaryModel: "gpt-4.1-mini"
    }
  });

  const result = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/provider-test-call",
    headers: adminHeaders,
    body: { scenario: "prd_generation", prompt: "Validate provider route", dryRun: true }
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.data.providerName, "OpenAI Test Call");
  assert.equal(result.body.data.status, "succeeded");
  assert.equal(String(JSON.stringify(result.body)).includes("sk-test-call-secret"), false);
});

test("Sprint 2 Admin UI exposes governance screens without plaintext secrets", () => {
  const adminSource = readAllSourceFiles("apps/admin-web/src");

  for (const text of [
    "useAiGovernance",
    "Register approved endpoint",
    "Persisted records",
    "Providers, masked credentials, and guardrail evidence",
    "Provider secrets are sent only to Platform API",
    "createProvider",
    "saveApiKey",
    "configureRoute",
    "configureQuota",
    "createGuardrailRule",
    "listAiProviders",
    "listAiApiKeys",
    "listGuardrailEvents"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }

  assert.doesNotMatch(adminSource, /sk-[A-Za-z0-9]/);
});

test("Admin governance renders unavailable guidance instead of fallback data", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(source, /aiGovernanceUnavailableMessage/);
  assert.match(source, /AI governance data is unavailable\. Refresh the page or sign in again\./);
  assert.match(source, /disabled = !canMutateAiGovernance\(ai\.availability\)/);
  assert.doesNotMatch(source, /local fallback rows remain visible/);
});

test("Admin governance never substitutes local route, rule, or evidence fixtures", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.doesNotMatch(source, /const routeRows/);
  assert.doesNotMatch(source, /const guardrailRows/);
  assert.doesNotMatch(source, /\?\? "OpenAI Production"/);
  assert.doesNotMatch(source, /Matched rule: Block payroll export/);
});

test("Admin governance does not load while logged out and gates provider test calls", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(source, /sessionActive \? createAdminPlatformClient\(\(\) => \{ clearAdminSession\(\); setSessionActive\(false\); \}\) : undefined/);
  assert.match(source, /if \(!client\) throw new Error\("AI governance API is unavailable"\)/);
  assert.match(source, /canMutateAiGovernance\(visibleAvailability\)/);
});

test("Admin logout disables governance and clears quota fixture evidence", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(
    source,
    /clearAdminSession\(\); setSessionActive\(false\);/
  );
  assert.doesNotMatch(source, /latestAiQuota\?\.usedToday \?\? 0/);
  assert.doesNotMatch(source, /latestAiQuota\?\.dailyLimit \?\? aiGovernanceForm\.quotaDailyLimit/);
  assert.doesNotMatch(source, /Organization 1,000 daily/);
  assert.doesNotMatch(source, /Creator 500 daily/);
  assert.doesNotMatch(source, /Project 300 daily/);
  assert.doesNotMatch(source, /App 100 daily/);
});

test("Admin clears derived governance state after a failed read or session transition", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(source, /setSnapshot\(emptySnapshot\)/);
  for (const reset of [
    "setSnapshot(emptySnapshot)",
    "setSnapshotClient(client)",
    "setAvailability(\"unavailable\")",
    "setMessage(aiGovernanceUnavailableMessage(error))"
  ]) {
    assert.match(source, new RegExp(reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /local fallback rows remain visible/);
});

test("Dashboard governance shows unavailable guidance instead of provider-test placeholders", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(source, /DecisionPanel tone=\{disabled \? "warning" : "success"\}/);
  assert.match(source, /badge=\{ai\.availability\} title=\{message \?\? ai\.message\}/);
});

test("Admin hides local route and rule rows until governance is ready", () => {
  const source = readAllSourceFiles("apps/admin-web/src");
  assert.match(
    source,
    /const visibleSnapshot = isSnapshotCurrent \? snapshot : emptySnapshot/
  );
  assert.match(
    source,
    /const visibleAvailability: AiGovernanceAvailability = isSnapshotCurrent/
  );
});
