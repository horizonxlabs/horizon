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

function seedGovernedPrdRoute(services) {
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
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/routes",
    headers: adminHeaders,
    body: {
      scenario: "prd_generation",
      primaryProviderId: provider.body.data.id,
      primaryModel: "gpt-4.1"
    }
  });
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
}

test("Sprint 3 API smoke creates project generates PRD draft and confirms baseline", () => {
  const services = createPlatformApiServices();
  seedGovernedPrdRoute(services);

  const project = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Management",
      slug: "leave-management-sprint3",
      appType: "Workflow App",
      businessProblem: "Employees need self-service leave requests with manager approval",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager", "HR Admin"],
      dataSensitivity: "internal"
    }
  });
  assert.equal(project.status, 201);

  const draft = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.version, "0.1");
  assert.ok(draft.body.data.sections.length >= 6);
  assert.equal(
    draft.body.data.generatedBy.providerId,
    services.aiGovernance.resolveRoute("prd_generation").primary.providerId
  );
  assert.ok(
    draft.body.data.sections
      .find((section) => section.key === "overview")
      ?.body.includes("AI Gateway Summary")
  );
  assert.ok(
    services.aiGovernance
      .listUsageLogs()
      .some((usage) => usage.scenario === "prd_generation" && usage.status === "succeeded")
  );

  const baseline = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.data.version, "1.0");
  assert.equal(baseline.body.data.isBaseline, true);

  const history = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${project.body.data.id}/prd/versions`,
    headers: creatorHeaders
  });
  assert.equal(history.status, 200);
  assert.ok(history.body.data.some((version) => version.status === "baseline"));
});

test("Sprint 3 API denies end user project and PRD access", () => {
  const services = createPlatformApiServices();
  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: endUserHeaders,
    body: {
      name: "Unauthorized",
      slug: "unauthorized"
    }
  });

  assert.equal(denied.status, 403);
});

test("Creator UI exposes project creation and optional AI project notes", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");

  for (const text of [
    "Opening latest project",
    "Create your first project",
    "Create project",
    "Create project wizard",
    "AI Project Notes",
    "Project Context",
    "Project Note Versions",
    "Generate AI Note"
  ]) {
    assert.match(creatorSource, new RegExp(text));
  }

  assert.doesNotMatch(creatorSource, /สร้างด้วย AI/);

  for (const component of [
    "WorkflowRail",
    "SectionCard",
    "DataTable",
    "DecisionPanel"
  ]) {
    assert.match(creatorSource, new RegExp(`\\b${component}\\b`));
  }
});
