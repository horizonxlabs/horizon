import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function sprint3Services() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Primary Production Key",
    secret: "sk-test-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });

  services.aiGovernance.configureRoute(admin, {
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1"
  });
  services.aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 5000,
    warningThreshold: 800,
    hardStop: true,
    usedToday: 0
  });

  return { services, creator };
}

test("creator creates a project and generates deterministic PRD draft through governed route", () => {
  const { services, creator } = sprint3Services();
  const project = services.projects.createProject({
    actor: creator,
    name: "Leave Management",
    slug: "leave-management-v2",
    appType: "Workflow App",
    businessProblem: "Employees need a governed leave request and approval flow",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });

  const draft = services.prds.generateDraft(creator, project.id);

  assert.equal(draft.projectId, project.id);
  assert.equal(draft.status, "draft");
  assert.equal(draft.version, "0.1");
  assert.equal(draft.generatedBy.scenario, "prd_generation");
  assert.equal(draft.generatedBy.providerId, services.aiGovernance.resolveRoute("prd_generation").primary.providerId);
  assert.ok(draft.sections.find((section) => section.key === "overview")?.body.includes("AI Gateway Summary"));
  assert.equal(services.aiGovernance.listUsageLogs().some((usage) => usage.scenario === "prd_generation" && usage.status === "succeeded"), true);
  assert.ok(draft.sections.some((section) => section.key === "acceptance_criteria"));
  assert.ok(services.audit.list().some((event) => event.action === "prd.draft.generated" && event.resourceId === draft.id));
});

test("creator confirms immutable PRD v1.0 baseline and cannot mutate it in place", () => {
  const { services, creator } = sprint3Services();
  const project = services.projects.createProject({
    actor: creator,
    name: "Leave Management",
    slug: "leave-management-baseline",
    appType: "Workflow App",
    businessProblem: "Create leave request approvals",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee"],
    dataSensitivity: "confidential"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  const baseline = services.prds.confirmBaseline(creator, project.id, draft.id);

  assert.equal(baseline.status, "baseline");
  assert.equal(baseline.version, "1.0");
  assert.equal(baseline.isBaseline, true);
  assert.throws(() => services.prds.confirmBaseline(creator, project.id, draft.id), /already confirmed/);
  assert.ok(services.prds.listVersions(creator, project.id).some((version) => version.id === baseline.id));
  assert.ok(services.audit.list().some((event) => event.action === "prd.baseline.confirmed" && event.resourceId === baseline.id));
});

test("creator cannot access another creator project PRD", () => {
  const { services, creator } = sprint3Services();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const project = services.projects.createProject({
    actor: admin,
    name: "Admin Only",
    slug: "admin-only",
    appType: "Internal Tool",
    businessProblem: "Restricted project",
    targetDepartment: "IT",
    intendedUsers: ["Admin"],
    dataSensitivity: "restricted"
  });

  assert.throws(() => services.prds.generateDraft(creator, project.id), /cannot access/);
});
