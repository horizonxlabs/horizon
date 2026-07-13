import { readFileSync } from "node:fs";
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
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "AI Providers & API Keys",
    "Provider Test Call",
    "Run Provider Test",
    "provider-test-call-panel",
    "Create Provider",
    "Save Masked Key",
    "Configure Route",
    "Configure Quota",
    "Add Guardrail Rule",
    "aiGovernance.availability",
    "Scenario Routing",
    "Token Quota",
    "Guardrail Rules",
    "Prompt Test",
    "Guardrail Events",
    "Fingerprint"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }

  assert.doesNotMatch(adminSource, /sk-[A-Za-z0-9]/);
});

test("Admin governance renders unavailable guidance instead of fallback data", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Refresh AI governance data/);
  assert.doesNotMatch(source, /local fallback rows remain visible/);
});

test("Admin governance never substitutes local route, rule, or evidence fixtures", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.doesNotMatch(source, /const routeRows/);
  assert.doesNotMatch(source, /const guardrailRows/);
  assert.doesNotMatch(source, /\?\? "OpenAI Production"/);
  assert.doesNotMatch(source, /Matched rule: Block payroll export/);
});

test("Admin governance does not load while logged out and gates provider test calls", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(source, /sessionActive \? createAdminPlatformClient\(\) : undefined/);
  assert.match(source, /if \(governanceWritesDisabled\) return;/);
  assert.equal(
    [...source.matchAll(/disabled=\{governanceWritesDisabled \|\| isRunningProviderTestCall\}/g)].length,
    2
  );
});

test("Admin logout disables governance and clears quota fixture evidence", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(
    source,
    /function handleLogoutBridge\(\) \{\s*setBootstrap\(clearAdminSessionBridge\(\)\);\s*setSessionActive\(false\);/s
  );
  assert.doesNotMatch(source, /latestAiQuota\?\.usedToday \?\? 0/);
  assert.doesNotMatch(source, /latestAiQuota\?\.dailyLimit \?\? aiGovernanceForm\.quotaDailyLimit/);
  assert.doesNotMatch(source, /Organization 1,000 daily/);
  assert.doesNotMatch(source, /Creator 500 daily/);
  assert.doesNotMatch(source, /Project 300 daily/);
  assert.doesNotMatch(source, /App 100 daily/);
});

test("Admin clears derived governance state after a failed read or session transition", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(source, /if \(aiGovernance\.availability === "ready"\) return;/);
  for (const reset of [
    "setLatestAiRoute(undefined)",
    "setLatestAiQuota(undefined)",
    "setLatestGuardrailRule(undefined)",
    "setProviderTestCallResult(undefined)",
    "setProviderTestCallMessage("
  ]) {
    assert.match(source, new RegExp(reset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(
    source,
    /setProviderTestCallMessage\("Provider test failed\. Review route, active key and adapter setup\."\)/
  );
});

test("Dashboard governance shows unavailable guidance instead of provider-test placeholders", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(source, /aiGovernance\.availability !== "ready" \? \(\s*aiGovernanceAvailabilityPanel/s);
  assert.ok([...source.matchAll(/aiGovernanceAvailabilityPanel/g)].length >= 4);
});
