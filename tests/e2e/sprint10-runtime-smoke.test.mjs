import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createPublishedProject(services) {
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
      name: "Leave Management Runtime",
      slug: "leave-management-runtime",
      appType: "Workflow App",
      businessProblem: "Employees need production leave workflow",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager", "HR Admin"],
      dataSensitivity: "internal"
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
  return project.body.data;
}

test("Sprint 10 API exposes generated app runtime overview and schema isolation evidence", () => {
  const services = createPlatformApiServices();
  const project = createPublishedProject(services);

  const runtime = executePlatformApiRequest(services, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}`,
    headers: adminHeaders
  });
  assert.equal(runtime.status, 200);
  assert.equal(runtime.body.data.artifactContract.root, "generated-apps/leave-management-runtime");
  assert.equal(runtime.body.data.container.status, "running");
  assert.equal(runtime.body.data.schemaIsolation.schemaName, "app_leave_management_runtime");

  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/runtime/projects/${project.id}/schema/check`,
    headers: adminHeaders,
    body: {
      attemptedSchema: "app_payroll",
      operation: "select"
    }
  });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.data.allowed, false);
  assert.equal(denied.body.data.reason, "cross_schema_access_denied");
});

test("Sprint 10 API exposes health readiness OpenAPI and migration dry-run evidence", () => {
  const services = createPlatformApiServices();
  const project = createPublishedProject(services);

  const health = executePlatformApiRequest(services, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}/health`,
    headers: adminHeaders
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.data.health.status, "healthy");
  assert.equal(health.body.data.readiness.ready, true);
  assert.equal(health.body.data.metrics.latencyP95Ms, 42);

  const openApi = executePlatformApiRequest(services, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}/openapi`,
    headers: adminHeaders
  });
  assert.equal(openApi.status, 200);
  assert.equal(openApi.body.data.version, "1.0.0");
  assert.ok(openApi.body.data.paths.includes("/api/leave-requests"));

  const dryRun = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/runtime/projects/${project.id}/migrations/dry-run`,
    headers: adminHeaders,
    body: {
      migrationId: "mig_drop_leave_balance",
      destructiveChanges: ["drop_column:leave_requests.balance_snapshot"],
      approvalId: ""
    }
  });
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.data.status, "blocked");
  assert.ok(dryRun.body.data.requiredApprovals.includes("Data Owner"));
});

test("Sprint 10 Admin runtime routes reject creator access", () => {
  const services = createPlatformApiServices();
  const project = createPublishedProject(services);

  const denied = executePlatformApiRequest(services, {
    method: "GET",
    path: `/admin/runtime/projects/${project.id}`,
    headers: creatorHeaders
  });

  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
});

test("Sprint 10 Admin UI exposes generated runtime hardening dashboard", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  for (const text of [
    "Generated App Runtime Hardening",
    "Container Contract",
    "Schema Isolation",
    "Health / Readiness",
    "Structured Logs",
    "Metrics",
    "OpenAPI Contract",
    "Migration Dry Run"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
});
