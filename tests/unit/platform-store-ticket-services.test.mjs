import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint7Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });
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

  for (const scenario of ["prd_generation", "frontend_coding"]) {
    services.aiGovernance.configureRoute(admin, {
      scenario,
      primaryProviderId: provider.id,
      primaryModel: "gpt-4.1"
    });
  }
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
    slug: "leave-management-sprint7",
    appType: "Workflow App",
    businessProblem: "Employees need self-service leave requests",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Add WFH leave type" });
  services.publish.publishApp(creator, project.id);

  return { services, creator, endUser, project };
}

test("storefront lists My Apps from registry and access policy", () => {
  const { services, endUser } = createSprint7Fixture();

  const home = services.storefront.listApps(endUser);

  assert.ok(home.myApps.some((app) => app.slug === "leave-management-sprint7" && app.accessStatus === "active"));
  assert.ok(home.myApps[0].primaryAction === "open");
  assert.ok(Array.isArray(home.availableApps));
  assert.ok(home.notifications.some((notification) => notification.type === "app_published"));
});

test("storefront returns app detail with owner role health version and actions", () => {
  const { services, endUser } = createSprint7Fixture();

  const detail = services.storefront.getAppDetail(endUser, "leave-management-sprint7");

  assert.equal(detail.slug, "leave-management-sprint7");
  assert.equal(detail.ownerName, "Creator User");
  assert.equal(detail.myRole, "Employee");
  assert.equal(detail.health, "healthy");
  assert.equal(detail.version, "manifest v1");
  assert.ok(detail.actions.includes("open"));
  assert.ok(detail.actions.includes("submit_ticket"));
});

test("request access creates pending request and returns existing pending request on duplicate", () => {
  const { services, endUser } = createSprint7Fixture();

  const first = services.storefront.requestAccess(endUser, "leave-management-sprint7", {
    requestedRoleKey: "manager",
    reason: "Need approval queue access",
    department: "HR"
  });
  const second = services.storefront.requestAccess(endUser, "leave-management-sprint7", {
    requestedRoleKey: "manager",
    reason: "Duplicate request",
    department: "HR"
  });

  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  assert.equal(second.id, first.id);
  assert.ok(services.audit.list().some((event) => event.action === "store.access_request.created" && event.resourceId === first.id));
});

test("ticket creation requires visible app and stores device info timeline", () => {
  const { services, endUser } = createSprint7Fixture();

  const ticket = services.tickets.createTicket(endUser, "leave-management-sprint7", {
    type: "bug",
    priority: "high",
    title: "WFH leave type not visible",
    description: "The WFH option disappeared on mobile.",
    deviceInfo: "iPhone 15 Safari"
  });
  const status = services.tickets.getTicketStatus(endUser, ticket.id);

  assert.equal(ticket.status, "submitted");
  assert.equal(ticket.ticketNumber, "TKT-0001");
  assert.equal(ticket.deviceInfo, "iPhone 15 Safari");
  assert.ok(status.timeline.some((entry) => entry.status === "submitted"));
  assert.throws(
    () =>
      services.tickets.createTicket(endUser, "hidden-app", {
        type: "bug",
        priority: "low",
        title: "Hidden",
        description: "Should not submit",
        deviceInfo: "Safari"
      }),
    /not visible|Unknown app/
  );
});

test("ticket status is scoped to submitter and creator inbox receives routed tickets", () => {
  const { services, creator, endUser, project } = createSprint7Fixture();
  const ticket = services.tickets.createTicket(endUser, "leave-management-sprint7", {
    type: "feedback",
    priority: "medium",
    title: "Approval queue is useful",
    description: "Please add manager filters.",
    deviceInfo: "Chrome Desktop"
  });
  const otherUser = { ...endUser, id: "usr_other", email: "other@company.com" };

  assert.throws(() => services.tickets.getTicketStatus(otherUser, ticket.id), /cannot access ticket/);

  const inbox = services.tickets.listCreatorInbox(creator, project.id);
  assert.ok(inbox.some((item) => item.id === ticket.id && item.submittedByEmail === "user@company.com"));
  assert.ok(inbox[0].actions.includes("convert_to_prd_change"));
});
