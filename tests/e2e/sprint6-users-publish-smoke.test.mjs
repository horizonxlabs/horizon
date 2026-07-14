import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

function createSprint6ApiFixture() {
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
      body: {
        scenario,
        primaryProviderId: provider.body.data.id,
        primaryModel: "gpt-4.1"
      }
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

  return { services, projectId: project.body.data.id, appSlug: project.body.data.appId };
}

test("Sprint 6 API invites users approves access publishes and exposes registry", () => {
  const { services, projectId, appSlug } = createSprint6ApiFixture();

  const snapshot = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/app/users`,
    headers: creatorHeaders
  });
  assert.equal(snapshot.status, 200);
  assert.ok(snapshot.body.data.roles.some((role) => role.key === "employee"));

  const invite = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/app/invitations`,
    headers: creatorHeaders,
    body: {
      email: "user@company.com",
      roleKey: "manager",
      userType: "internal",
      note: "Join manager queue"
    }
  });
  assert.equal(invite.status, 201);
  assert.equal(invite.body.data.status, "pending");

  const request = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/app/access-requests`,
    headers: creatorHeaders,
    body: {
      requesterEmail: "manager@company.com",
      requestedRoleKey: "manager",
      reason: "Approval queue"
    }
  });
  assert.equal(request.status, 201);

  const decision = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/app/access-requests/decision`,
    headers: creatorHeaders,
    body: { requestId: request.body.data.id, decision: "approved" }
  });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.data.status, "approved");

  const review = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/publish/review`,
    headers: creatorHeaders
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.data.ready, true);

  const publish = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/publish`,
    headers: creatorHeaders
  });
  assert.equal(publish.status, 201);
  assert.equal(publish.body.data.deployment.status, "published");

  const registry = executePlatformApiRequest(services, {
    method: "GET",
    path: "/app-store/registry",
    headers: creatorHeaders
  });
  assert.equal(registry.status, 200);
  assert.ok(registry.body.data.some((entry) => entry.slug === appSlug));
});

test("Sprint 6 API blocks incomplete publish and denies end user creator-side management", () => {
  const { services } = createSprint6ApiFixture();
  const project = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: { name: "Incomplete App", slug: "incomplete-app" }
  });

  const publish = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/publish`,
    headers: creatorHeaders
  });
  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${project.body.data.id}/app/users`,
    headers: endUserHeaders
  });

  assert.equal(publish.status, 422);
  assert.match(publish.body.error.message, /Publish blocked/);
  assert.equal(denied.status, 403);
});

test("Sprint 6 Creator UI exposes app users roles invite access manifest publish deployment and registry", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");

  for (const text of [
    "App Users",
    "เชิญผู้ใช้",
    "Access Requests",
    "App Roles",
    "Publish Review",
    "Readiness checklist",
    "Publish to App Store",
    "Deployment Record",
    "No deployment record",
    "No registry entry returned"
  ]) {
    assert.match(creatorSource, new RegExp(text));
  }

  for (const component of [
    "SectionCard",
    "DataTable",
    "DefinitionGrid",
    "DecisionPanel",
    "ToneBadge"
  ]) {
    assert.match(creatorSource, new RegExp(`\\b${component}\\b`));
  }
});
