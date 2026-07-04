import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createBaselineWorkspaceFixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });

  services.aiGovernance.configureRoute(admin, {
    scenario: "frontend_coding",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1"
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

  const project = services.projects.createProject({
    actor: creator,
    name: "Leave Management",
    slug: "leave-management-workspace",
    appType: "Workflow App",
    businessProblem: "Employees need self-service leave requests",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);

  return { services, admin, creator, project };
}

test("workspace prompt creates deterministic task progress preview and usage log", () => {
  const { services, creator, project } = createBaselineWorkspaceFixture();

  const result = services.workspace.submitPrompt(creator, project.id, {
    prompt: "Add WFH leave type"
  });

  assert.equal(result.guardrail.decision, "allow");
  assert.equal(result.task.status, "ready");
  assert.equal(result.task.steps.at(-1)?.status, "done");
  assert.equal(result.preview.projectId, project.id);
  assert.match(result.preview.summary, /WFH leave type/);
  assert.equal(result.usage.tokensUsed, 120);
  assert.equal(result.tokenBudget.remainingToday, 880);
  assert.ok(services.workspace.listUsage(creator, project.id).some((event) => event.prompt === "Add WFH leave type"));
});

test("workspace blocks prompt before preview generation when guardrail blocks", () => {
  const { services, admin, creator, project } = createBaselineWorkspaceFixture();
  services.guardrails.createRule(admin, {
    name: "Block payroll export",
    type: "keyword",
    pattern: "payroll export",
    severity: "high",
    action: "block",
    scope: "organization"
  });

  const result = services.workspace.submitPrompt(creator, project.id, {
    prompt: "Add payroll export button"
  });

  assert.equal(result.guardrail.decision, "block");
  assert.equal(result.task.status, "blocked");
  assert.equal(result.preview.version, "preview-0000");
  assert.equal(services.workspace.listUsage(creator, project.id).length, 0);
});

test("workspace requires confirmed PRD baseline before accepting prompts", () => {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });
  services.aiGovernance.configureRoute(admin, {
    scenario: "frontend_coding",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1"
  });
  const project = services.projects.createProject({
    actor: creator,
    name: "Draft Only",
    slug: "draft-only",
    appType: "Workflow App"
  });

  assert.throws(() => services.workspace.submitPrompt(creator, project.id, { prompt: "Add dashboard" }), /PRD baseline/);
});
