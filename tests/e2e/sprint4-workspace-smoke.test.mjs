import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createWorkspaceApiFixture() {
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
      slug: "leave-management-sprint4",
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

test("Sprint 4 API smoke accepts safe prompt updates preview and records usage", () => {
  const { services, projectId } = createWorkspaceApiFixture();

  const response = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type" }
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.guardrail.decision, "allow");
  assert.equal(response.body.data.task.status, "ready");
  assert.equal(response.body.data.tokenBudget.remainingToday, 880);

  const workspace = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/workspace`,
    headers: creatorHeaders
  });
  assert.equal(workspace.status, 200);
  assert.match(workspace.body.data.preview.summary, /WFH leave type/);
  assert.ok(workspace.body.data.usage.length > 0);
});

test("Sprint 4 API smoke blocks guardrail prompt before preview update", () => {
  const { services, projectId } = createWorkspaceApiFixture();
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

  const response = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add payroll export button" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.guardrail.decision, "block");
  assert.equal(response.body.data.task.status, "blocked");
  assert.equal(response.body.data.preview.version, "preview-0000");
});

test("Sprint 4 Creator workspace UI exposes one Auto Pi composer and existing workspace tools", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");

  for (const text of [
    "Create and understand your app with Pi",
    "Ask Pi about the app or describe a change. Files change only when your request asks for it.",
    "Preview",
    "Code",
    "Database",
    "Publish",
    "Project files",
    "Authorizing preview",
    "Retry preview",
    "committed"
  ]) {
    assert.match(creatorSource, new RegExp(text));
  }

  for (const component of ["WorkspaceCodePanel", "WorkspaceDatabasePanel", "PublishDialog"]) {
    assert.match(creatorSource, new RegExp(`\\b${component}\\b`));
  }

  for (const removedText of ["Plan with AI", "Build with AI", "Workspace mode"]) {
    assert.doesNotMatch(creatorSource, new RegExp(removedText));
  }
});
