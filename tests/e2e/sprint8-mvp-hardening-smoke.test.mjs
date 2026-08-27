import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

function createSprint8ApiFixture() {
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
      targetDepartment: "HR Department",
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
    path: `/projects/${project.body.data.id}/publish`,
    headers: creatorHeaders,
    body: { subdomain: "sprint8-hardening" }
  });
  const ticket = executePlatformApiRequest(services, {
    method: "POST",
    path: `/store/apps/${project.body.data.appId}/tickets`,
    headers: endUserHeaders,
    body: {
      type: "bug",
      priority: "high",
      title: "WFH leave type missing",
      description: "WFH is not visible on mobile.",
      deviceInfo: "iPhone Safari"
    }
  });

  return { services, projectId: project.body.data.id, ticketId: ticket.body.data.id };
}

test("Sprint 8 API converts ticket to PRD change and approves it into a PRD version", () => {
  const { services, projectId, ticketId } = createSprint8ApiFixture();

  const change = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/from-ticket`,
    headers: creatorHeaders,
    body: {
      ticketId,
      title: "Add WFH leave visibility requirement",
      proposedRequirement: "WFH leave type must be visible on mobile request form.",
      affectedSections: ["core_flows"],
      acceptanceCriteria: ["WFH option appears on mobile"],
      riskLevel: "medium"
    }
  });
  assert.equal(change.status, 201);
  assert.equal(change.body.data.sourceTicketId, ticketId);
  assert.equal(change.body.data.status, "pending_approval");

  const duplicate = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/from-ticket`,
    headers: creatorHeaders,
    body: {
      ticketId,
      title: "Duplicate",
      proposedRequirement: "Duplicate",
      affectedSections: ["core_flows"],
      acceptanceCriteria: ["No duplicate"],
      riskLevel: "low"
    }
  });
  assert.equal(duplicate.body.data.id, change.body.data.id);

  const approval = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/decision`,
    headers: creatorHeaders,
    body: {
      changeId: change.body.data.id,
      decision: "approved",
      note: "Approved for pilot"
    }
  });
  assert.equal(approval.status, 200);
  assert.equal(approval.body.data.change.status, "approved");
  assert.equal(approval.body.data.prdVersion.version, "1.1");
});

test("Sprint 8 API governs public domain requests and exposes traceability", () => {
  const { services, projectId, ticketId } = createSprint8ApiFixture();
  const change = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/from-ticket`,
    headers: creatorHeaders,
    body: {
      ticketId,
      title: "Add WFH leave visibility requirement",
      proposedRequirement: "WFH leave type must be visible on mobile request form.",
      affectedSections: ["core_flows"],
      acceptanceCriteria: ["WFH option appears on mobile"],
      riskLevel: "medium"
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/decision`,
    headers: creatorHeaders,
    body: { changeId: change.body.data.id, decision: "approved", note: "Approved" }
  });

  const domainRequest = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/domains/requests`,
    headers: creatorHeaders,
    body: {
      domain: "leave.company.example",
      reason: "Pilot group needs a memorable URL",
      intendedAudience: "HR pilot users",
      dataClassification: "internal",
      externalUserPolicy: "approved_users",
      checklistAccepted: true
    }
  });
  assert.equal(domainRequest.status, 201);
  assert.equal(domainRequest.body.data.status, "pending_approval");

  const domainDecision = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/domain-requests/${domainRequest.body.data.id}/decision`,
    headers: adminHeaders,
    body: { decision: "approved", note: "Approved for private pilot" }
  });
  assert.equal(domainDecision.status, 200);
  assert.equal(domainDecision.body.data.status, "approved");

  const trace = executePlatformApiRequest(services, {
    method: "GET",
    path: `/creator/projects/${projectId}/traceability`,
    headers: creatorHeaders
  });
  assert.equal(trace.status, 200);
  assert.equal(trace.body.data.ticket.id, ticketId);
  assert.equal(trace.body.data.prdChange.id, change.body.data.id);
  assert.equal(trace.body.data.domain.publicDomain, "leave.company.example");
  assert.ok(trace.body.data.deployment.deploymentId);
});

test("Sprint 8 API exposes monitoring dashboard and filtered audit log", () => {
  const { services, projectId, ticketId } = createSprint8ApiFixture();
  const change = executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/from-ticket`,
    headers: creatorHeaders,
    body: {
      ticketId,
      title: "Add WFH leave visibility requirement",
      proposedRequirement: "WFH leave type must be visible on mobile request form.",
      affectedSections: ["core_flows"],
      acceptanceCriteria: ["WFH option appears on mobile"],
      riskLevel: "medium"
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/creator/projects/${projectId}/prd/changes/decision`,
    headers: creatorHeaders,
    body: { changeId: change.body.data.id, decision: "approved", note: "Approved" }
  });

  const monitoring = executePlatformApiRequest(services, {
    method: "GET",
    path: "/admin/monitoring",
    headers: adminHeaders
  });
  assert.equal(monitoring.status, 200);
  assert.ok(monitoring.body.data.serviceHealth.some((service) => service.name === "Platform API"));
  assert.ok(monitoring.body.data.ticketCounts.open >= 1);

  const audit = executePlatformApiRequest(services, {
    method: "POST",
    path: "/audit-logs/filter",
    headers: adminHeaders,
    body: {
      action: "prd.change.approved",
      projectId,
      severity: "high"
    }
  });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.data.every((event) => event.action === "prd.change.approved"));
});

test("Sprint 8 UI exposes fail-closed ticket changes and API-backed operational evidence", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");
  const adminSource = readAllSourceFiles("apps/admin-web/src");

  for (const text of [
    "Tickets & Changes",
    "Creator Ticket Inbox",
    "Convert to PRD Change",
    "Platform API support required",
    "Create an auditable PRD change",
    "Ticket service is unavailable",
    "Creates a governed PRD change from this ticket"
  ]) {
    assert.match(creatorSource, new RegExp(text));
  }

  for (const text of ["AuditEvidenceSection", "Service health", "Audit Filters", "Platform API"]) {
    assert.match(adminSource, new RegExp(text));
  }
});
