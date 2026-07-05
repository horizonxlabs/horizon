import assert from "node:assert/strict";
import test from "node:test";

const { createPlatformApiClient, PlatformApiError } = await import("../../packages/api-client/src/index.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createCreatorPublishFixture() {
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
    body: { scope: "creator", dailyLimit: 1000, monthlyLimit: 5000, warningThreshold: 800, hardStop: true, usedToday: 0 }
  });
  const project = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Management",
      slug: "leave-management-publish-actions",
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
  return { services, projectId: project.body.data.id };
}

function createApiClientForServices(services) {
  return createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
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

test("Creator publish API client actions invite approve publish and list registry", async () => {
  const { services, projectId } = createCreatorPublishFixture();
  const client = createApiClientForServices(services);

  const initial = await client.getAppAccessSnapshot(projectId);
  assert.ok(initial.roles.some((role) => role.key === "manager"));
  assert.ok(initial.accessRequests.some((request) => request.status === "pending"));

  const invite = await client.createAppInvitation(projectId, {
    email: "finance.manager@company.com",
    roleKey: "manager",
    userType: "internal",
    note: "Join manager approval queue"
  });
  assert.equal(invite.status, "pending");

  const pending = initial.accessRequests.find((request) => request.status === "pending");
  assert.ok(pending);
  const approved = await client.decideAppAccessRequest(projectId, {
    requestId: pending.id,
    decision: "approved"
  });
  assert.equal(approved.status, "approved");

  const afterAccess = await client.getAppAccessSnapshot(projectId);
  assert.ok(afterAccess.members.some((member) => member.email === pending.requesterEmail && member.roleKey === "manager"));

  const review = await client.getPublishReview(projectId);
  assert.equal(review.ready, true);

  const publish = await client.publishProject(projectId);
  assert.equal(publish.deployment.status, "published");
  assert.equal(publish.registryEntry.slug, "leave-management-publish-actions");

  const registry = await client.listAppStoreRegistry();
  assert.ok(registry.some((entry) => entry.slug === "leave-management-publish-actions"));
});

test("Creator publish API client surfaces blocked publish as typed error", async () => {
  const services = createPlatformApiServices();
  const client = createApiClientForServices(services);
  const incomplete = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: { name: "Incomplete App", slug: "incomplete-publish-actions" }
  });

  await assert.rejects(
    () => client.publishProject(incomplete.body.data.id),
    (error) => {
      assert.ok(error instanceof PlatformApiError);
      assert.equal(error.status, 422);
      assert.match(error.message, /Publish blocked/);
      return true;
    }
  );
});
