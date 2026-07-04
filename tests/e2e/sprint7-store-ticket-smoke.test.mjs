import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };
const endUserHeaders = { "x-mock-user-email": "user@company.com" };

function createSprint7ApiFixture() {
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
      slug: "leave-management-sprint7",
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
    path: `/projects/${project.body.data.id}/publish`,
    headers: creatorHeaders
  });

  return { services, projectId: project.body.data.id };
}

test("Sprint 7 API lists apps requests access submits ticket and tracks status", () => {
  const { services } = createSprint7ApiFixture();

  const home = executePlatformApiRequest(services, {
    method: "GET",
    path: "/store/apps",
    headers: endUserHeaders
  });
  assert.equal(home.status, 200);
  assert.ok(home.body.data.myApps.some((app) => app.slug === "leave-management-sprint7"));

  const detail = executePlatformApiRequest(services, {
    method: "GET",
    path: "/store/apps/leave-management-sprint7",
    headers: endUserHeaders
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.myRole, "Employee");

  const access = executePlatformApiRequest(services, {
    method: "POST",
    path: "/store/apps/leave-management-sprint7/access-requests",
    headers: endUserHeaders,
    body: { requestedRoleKey: "manager", reason: "Need approval access", department: "HR" }
  });
  assert.equal(access.status, 201);
  assert.equal(access.body.data.status, "pending");

  const ticket = executePlatformApiRequest(services, {
    method: "POST",
    path: "/store/apps/leave-management-sprint7/tickets",
    headers: endUserHeaders,
    body: {
      type: "bug",
      priority: "high",
      title: "WFH leave type missing",
      description: "The WFH option is not visible on mobile.",
      deviceInfo: "iPhone Safari"
    }
  });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.body.data.status, "submitted");

  const status = executePlatformApiRequest(services, {
    method: "GET",
    path: `/store/tickets/${ticket.body.data.id}`,
    headers: endUserHeaders
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.data.ticketNumber, "TKT-0001");
  assert.ok(status.body.data.timeline.some((entry) => entry.status === "submitted"));
});

test("Sprint 7 API routes tickets to Creator inbox and denies invisible ticket submission", () => {
  const { services, projectId } = createSprint7ApiFixture();
  const ticket = executePlatformApiRequest(services, {
    method: "POST",
    path: "/store/apps/leave-management-sprint7/tickets",
    headers: endUserHeaders,
    body: {
      type: "feedback",
      priority: "medium",
      title: "Add team filters",
      description: "Manager queue needs filters.",
      deviceInfo: "Chrome Desktop"
    }
  });
  assert.equal(ticket.status, 201);

  const inbox = executePlatformApiRequest(services, {
    method: "GET",
    path: `/creator/projects/${projectId}/tickets`,
    headers: creatorHeaders
  });
  assert.equal(inbox.status, 200);
  assert.ok(inbox.body.data.some((item) => item.id === ticket.body.data.id));

  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/store/apps/hidden-app/tickets",
    headers: endUserHeaders,
    body: {
      type: "bug",
      priority: "low",
      title: "Hidden",
      description: "Should not be accepted.",
      deviceInfo: "Safari"
    }
  });
  assert.ok([403, 404, 422].includes(denied.status));
});

test("Sprint 7 App Store PWA assets and UI expose mobile store ticket workflow", () => {
  const storeSource = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");
  const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");

  assert.equal(existsSync("apps/app-store-pwa/public/manifest.webmanifest"), true);
  assert.equal(existsSync("apps/app-store-pwa/public/offline.html"), true);
  assert.match(readFileSync("apps/app-store-pwa/public/manifest.webmanifest", "utf8"), /Enterprise App Store/);

  for (const text of [
    "App Store",
    "My Apps",
    "Available Apps",
    "App Detail",
    "Request Access",
    "Submit Ticket",
    "Ticket Status",
    "TKT-0001",
    "Offline"
  ]) {
    assert.match(storeSource, new RegExp(text));
  }

  for (const text of ["Creator Ticket Inbox", "Convert to PRD Change", "Convert to AI Prompt", "Resolve"]) {
    assert.match(creatorSource, new RegExp(text));
  }
});
