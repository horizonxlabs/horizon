import assert from "node:assert/strict";
import test from "node:test";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { createPlatformApiClient } = await import("../../packages/api-client/src/index.ts");
const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createStoreActionsFixture() {
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
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/api-keys",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      name: "Primary Production Key",
      secret: "sk-test-secret-that-must-not-leak",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1
    }
  });
  for (const scenario of ["prd_generation", "frontend_coding"]) {
    executePlatformApiRequest(services, {
      method: "POST",
      path: "/ai/routes",
      headers: adminHeaders,
      body: { scenario, primaryProviderId: provider.body.data.id, primaryModel: "gpt-4.1" }
    });
  }
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/quotas",
    headers: adminHeaders,
    body: {
      scope: "creator",
      dailyLimit: 1000,
      monthlyLimit: 5000,
      warningThreshold: 800,
      hardStop: true,
      usedToday: 0
    }
  });
  const project = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Management",
      appType: "Workflow App",
      businessProblem: "Employees need leave requests",
      intendedUsers: ["Employee", "Manager"]
    }
  });
  const draft = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type" }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/publish`,
    headers: creatorHeaders
  });
  return { services, appSlug: project.body.data.appId };
}

function createApiClientForServices(services) {
  return createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init = {}) => {
      const parsed = new URL(String(url));
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const result = executePlatformApiRequest(services, {
        method: init.method ?? "GET",
        path: parsed.pathname.replace(/^\/api/, ""),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body
      });
      return new Response(JSON.stringify(result.body), { status: result.status });
    }
  });
}

test("App Store API client actions request access submit ticket and read status", async () => {
  const { services, appSlug } = createStoreActionsFixture();
  const client = createApiClientForServices(services);

  const detail = await client.getStoreAppDetail(appSlug);
  assert.equal(detail.accessStatus, "active");
  assert.ok(detail.actions.includes("submit_ticket"));

  assert.equal(typeof client.installStoreApp, "function");
  assert.equal(typeof client.uninstallStoreApp, "function");

  const access = await client.requestStoreAccess(appSlug, {
    requestedRoleKey: "manager",
    reason: "Need approval access",
    department: "HR"
  });
  assert.equal(access.status, "pending");
  assert.equal(access.requestedRoleKey, "manager");

  const duplicateAccess = await client.requestStoreAccess(appSlug, {
    requestedRoleKey: "manager",
    reason: "Duplicate click",
    department: "HR"
  });
  assert.equal(duplicateAccess.id, access.id);

  const ticket = await client.submitStoreTicket(appSlug, {
    type: "bug",
    priority: "high",
    title: "WFH leave type missing",
    description: "The WFH option is not visible on mobile.",
    deviceInfo: "iPhone Safari"
  });
  assert.equal(ticket.status, "submitted");

  const status = await client.getStoreTicket(ticket.id);
  assert.equal(status.ticketNumber, "TKT-0001");
  assert.equal(status.appName, "Leave Management");
  assert.ok(status.timeline.some((entry) => entry.status === "submitted"));

  await assert.rejects(
    () =>
      client.submitStoreTicket(appSlug, {
        type: "bug",
        priority: "medium",
        title: " ",
        description: "Missing title must stay rejected.",
        deviceInfo: "Desktop"
      }),
    /title is required/i
  );
});
