import assert from "node:assert/strict";
import test from "node:test";

const { createPlatformApiClient } = await import("../../packages/api-client/src/index.ts");
const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createWorkspaceActionsFixture() {
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
      slug: "leave-management-workspace-actions",
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

test("Creator workspace API client actions submit prompt refresh preview and read snapshot", async () => {
  const { services, projectId } = createWorkspaceActionsFixture();
  const client = createApiClientForServices(services);

  const initial = await client.getWorkspace(projectId);
  assert.equal(initial.preview.version, "preview-0000");

  const result = await client.submitWorkspacePrompt(projectId, { prompt: "Add WFH leave type" });
  assert.equal(result.guardrail.decision, "allow");
  assert.equal(result.task.status, "ready");
  assert.equal(result.tokenBudget.remainingToday, 880);

  const refreshed = await client.refreshWorkspacePreview(projectId);
  assert.equal(refreshed.version, result.preview.version);
  assert.match(refreshed.summary, /WFH leave type/);

  const snapshot = await client.getWorkspace(projectId);
  assert.equal(snapshot.preview.version, result.preview.version);
  assert.ok(snapshot.tasks.some((task) => task.id === result.task.id));
  assert.ok(snapshot.usage.some((entry) => entry.taskId === result.task.id));
});

test("Creator workspace API client Plan mode records read-only evidence without preview mutation", async () => {
  const { services, projectId } = createWorkspaceActionsFixture();
  const client = createApiClientForServices(services);

  const initial = await client.getWorkspace(projectId);
  assert.equal(initial.preview.version, "preview-0000");

  const result = await client.submitWorkspacePrompt(projectId, {
    prompt: "Plan how to add WFH leave type",
    agentMode: "plan"
  });

  assert.equal(result.guardrail.decision, "allow");
  assert.equal(result.task.status, "blocked");
  assert.equal(result.preview.version, "preview-0000");
  assert.equal(result.usage, undefined);

  const snapshot = await client.getWorkspace(projectId);
  assert.equal(snapshot.preview.version, "preview-0000");
  assert.equal(snapshot.usage.length, 0);
  assert.ok(snapshot.tasks.some((task) => task.id === result.task.id));
});

test("Creator workspace API client blocked prompt keeps existing preview evidence", async () => {
  const { services, projectId } = createWorkspaceActionsFixture();
  const client = createApiClientForServices(services);

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

  const result = await client.submitWorkspacePrompt(projectId, {
    prompt: "Add payroll export button"
  });

  assert.equal(result.guardrail.decision, "block");
  assert.equal(result.task.status, "blocked");
  assert.equal(result.preview.version, "preview-0000");

  const snapshot = await client.getWorkspace(projectId);
  assert.ok(snapshot.tasks.some((task) => task.status === "blocked"));
  assert.equal(snapshot.preview.version, "preview-0000");
});

test("Creator workspace API client uploads a project file and attaches it to a prompt", async () => {
  const { services, projectId } = createWorkspaceActionsFixture();
  const client = createApiClientForServices(services);

  const initialized = await client.initializeProjectFileUpload(projectId, {
    fileName: "brand-guide.md",
    mimeType: "text/markdown",
    sizeBytes: 512,
    sha256: "d".repeat(64),
    includeByDefault: true
  });

  assert.equal(initialized.file.uploadStatus, "pending");
  assert.match(initialized.uploadUrl, /^memory:\/\//);

  const completed = await client.completeProjectFileUpload(projectId, initialized.uploadId, {
    scanStatus: "clean",
    extractedText: "Use a teal logo and compact approval cards."
  });

  assert.equal(completed.file.scanStatus, "clean");
  assert.equal(completed.file.indexStatus, "indexed");

  const files = await client.listProjectFiles(projectId);
  assert.equal(files.length, 1);
  assert.equal(files[0].fileName, "brand-guide.md");

  const result = await client.submitWorkspacePrompt(projectId, {
    prompt: "Apply the uploaded brand guide",
    attachmentIds: [initialized.uploadId]
  });

  assert.deepEqual(result.task.knowledgeVersionIds, [completed.file.versionId]);
  assert.equal(result.knowledgeRetrieval.matchedVersionIds[0], completed.file.versionId);
});
