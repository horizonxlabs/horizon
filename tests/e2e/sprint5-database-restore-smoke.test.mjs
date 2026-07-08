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

function createSprint5ApiFixture() {
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
      slug: "leave-management-sprint5",
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
    path: `/projects/${project.body.data.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Improve manager dashboard" }
  });

  return { services, projectId: project.body.data.id };
}

test("Sprint 5 API exposes read-only database metadata and denies raw SQL", () => {
  const { services, projectId } = createSprint5ApiFixture();

  const database = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/database`,
    headers: creatorHeaders
  });
  assert.equal(database.status, 200);
  assert.equal(database.body.data.readOnly, true);
  assert.ok(database.body.data.tables.some((table) => table.key === "leave_requests"));
  assert.ok(
    database.body.data.sampleRecords.some((record) => record.tableKey === "leave_requests")
  );

  const rawSql = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/database/sql`,
    headers: creatorHeaders,
    body: { sql: "DROP TABLE leave_requests" }
  });
  assert.equal(rawSql.status, 403);
});

test("Sprint 5 API denies end user database and checkpoint access", () => {
  const { services, projectId } = createSprint5ApiFixture();

  const database = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/database`,
    headers: endUserHeaders
  });
  const checkpoints = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/frontend/checkpoints`,
    headers: endUserHeaders
  });

  assert.equal(database.status, 403);
  assert.equal(checkpoints.status, 403);
});

test("Sprint 5 API restores frontend checkpoint only and audits result", () => {
  const { services, projectId } = createSprint5ApiFixture();

  const checkpoints = executePlatformApiRequest(services, {
    method: "GET",
    path: `/projects/${projectId}/frontend/checkpoints`,
    headers: creatorHeaders
  });
  const oldCheckpoint = checkpoints.body.data.checkpoints.find(
    (checkpoint) => checkpoint.version === "fe-0001"
  );
  assert.ok(oldCheckpoint);

  const compare = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/frontend/compare`,
    headers: creatorHeaders,
    body: {
      fromCheckpointId: oldCheckpoint.id,
      toCheckpointId: checkpoints.body.data.activeCheckpoint.id
    }
  });
  assert.equal(compare.status, 200);
  assert.ok(compare.body.data.changedAreas.includes("UI components"));

  const restore = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${projectId}/frontend/restore`,
    headers: creatorHeaders,
    body: { checkpointId: oldCheckpoint.id }
  });
  assert.equal(restore.status, 200);
  assert.equal(restore.body.data.boundary.frontendChanged, true);
  assert.ok(restore.body.data.boundary.unchanged.includes("database"));
  assert.ok(services.audit.list().some((event) => event.action === "frontend.restore.completed"));
});

test("Sprint 5 Creator UI exposes database view frontend versions compare and restore boundary", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");

  for (const text of [
    "Database View",
    "Schema",
    "Sample Records",
    "Migration History",
    "Frontend Versions",
    "Compare",
    "Restore Frontend Only",
    "Will not change",
    "backend",
    "database",
    "auth",
    "PRD baseline"
  ]) {
    assert.match(creatorSource, new RegExp(text));
  }

  for (const component of [
    "PageHeader",
    "SectionCard",
    "DataTable",
    "DecisionPanel",
    "ToneBadge"
  ]) {
    assert.match(creatorSource, new RegExp(`\\b${component}\\b`));
  }
});
