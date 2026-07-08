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
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Primary Production Key",
    secret: "sk-test-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
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
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Primary Production Key",
    secret: "sk-test-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
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

test("creator project file upload creates clean indexed project knowledge for workspace attachments", () => {
  const { services, creator, project } = createBaselineWorkspaceFixture();

  const initialized = services.projectFiles.initializeUpload(creator, project.id, {
    fileName: "brand-guidelines.md",
    mimeType: "text/markdown",
    sizeBytes: 512,
    sha256: "a".repeat(64),
    includeByDefault: true
  });

  assert.equal(initialized.file.uploadStatus, "pending");
  assert.equal(initialized.file.scanStatus, "pending");
  assert.match(initialized.uploadUrl, /^memory:\/\/project-file-uploads\//);

  const completed = services.projectFiles.completeUpload(creator, project.id, initialized.uploadId, {
    scanStatus: "clean",
    extractedText: "# Brand\nUse the uploaded teal logo and compact dashboard layout."
  });

  assert.equal(completed.file.uploadStatus, "uploaded");
  assert.equal(completed.file.scanStatus, "clean");
  assert.equal(completed.file.indexStatus, "indexed");

  const files = services.projectFiles.listProjectFiles(creator, project.id);
  assert.equal(files.length, 1);
  assert.equal(files[0].fileName, "brand-guidelines.md");

  const result = services.workspace.submitPrompt(creator, project.id, {
    prompt: "Use the uploaded brand guide on the home page",
    attachmentIds: [initialized.uploadId]
  });

  assert.deepEqual(result.task.knowledgeVersionIds, [completed.file.versionId]);
  assert.deepEqual(result.knowledgeRetrieval.matchedVersionIds, [completed.file.versionId]);
  assert.equal(result.knowledgeRetrieval.sources[0].title, "brand-guidelines.md");
});

test("creator project image upload is indexed as image knowledge metadata", () => {
  const { services, creator, project } = createBaselineWorkspaceFixture();

  const initialized = services.projectFiles.initializeUpload(creator, project.id, {
    fileName: "logo.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    sha256: "e".repeat(64)
  });
  const completed = services.projectFiles.completeUpload(creator, project.id, initialized.uploadId, {
    scanStatus: "clean"
  });

  const result = services.workspace.submitPrompt(creator, project.id, {
    prompt: "Use the uploaded logo",
    attachmentIds: [completed.file.id]
  });

  assert.equal(result.knowledgeRetrieval.sources[0].sourceType, "image");
  assert.match(result.knowledgeRetrieval.sources[0].excerpts[0], /Uploaded logo.png/);
});

test("workspace attachments reject files from another project and files that are not ready", () => {
  const { services, creator, project } = createBaselineWorkspaceFixture();
  const otherProject = services.projects.createProject({
    actor: creator,
    name: "Other Workspace",
    slug: "other-workspace",
    appType: "Workflow App",
    businessProblem: "Separate project",
    targetDepartment: "Finance Department",
    intendedUsers: ["Analyst"],
    dataSensitivity: "internal"
  });

  const pending = services.projectFiles.initializeUpload(creator, project.id, {
    fileName: "pending-notes.txt",
    mimeType: "text/plain",
    sizeBytes: 256,
    sha256: "b".repeat(64)
  });

  assert.throws(
    () =>
      services.workspace.submitPrompt(creator, project.id, {
        prompt: "Use the pending notes",
        attachmentIds: [pending.uploadId]
      }),
    /not ready for AI context/
  );

  const otherUpload = services.projectFiles.initializeUpload(creator, otherProject.id, {
    fileName: "other-project.md",
    mimeType: "text/markdown",
    sizeBytes: 256,
    sha256: "c".repeat(64)
  });

  services.projectFiles.completeUpload(creator, otherProject.id, otherUpload.uploadId, {
    scanStatus: "clean",
    extractedText: "Other project content"
  });

  assert.throws(
    () =>
      services.workspace.submitPrompt(creator, project.id, {
        prompt: "Use another project file",
        attachmentIds: [otherUpload.uploadId]
      }),
    /does not belong to this project/
  );
});
