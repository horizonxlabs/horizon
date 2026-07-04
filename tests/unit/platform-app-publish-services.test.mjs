import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint6Fixture() {
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
    slug: "leave-management-sprint6",
    appType: "Workflow App",
    businessProblem: "Employees need self-service leave requests",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Add WFH leave type" });

  return { services, creator, endUser, project };
}

test("app access snapshot includes roles members invites and requests", () => {
  const { services, creator, project } = createSprint6Fixture();

  const snapshot = services.appAccess.getSnapshot(creator, project.id);

  assert.ok(snapshot.roles.some((role) => role.key === "employee"));
  assert.ok(snapshot.roles.some((role) => role.key === "manager"));
  assert.ok(snapshot.roles.some((role) => role.key === "hr_admin"));
  assert.ok(snapshot.members.some((member) => member.email === "user@company.com" && member.roleKey === "employee"));
  assert.ok(snapshot.invitations.some((invite) => invite.status === "pending"));
  assert.ok(snapshot.accessRequests.some((request) => request.status === "pending"));
});

test("internal and external invitations record policy state and audit events", () => {
  const { services, creator, project } = createSprint6Fixture();

  const internalInvite = services.appAccess.createInvitation(creator, project.id, {
    email: "user@company.com",
    roleKey: "manager",
    userType: "internal",
    note: "Join manager queue"
  });
  const externalInvite = services.appAccess.createInvitation(creator, project.id, {
    email: "vendor@example.com",
    roleKey: "employee",
    userType: "external",
    expiresAt: "2026-09-01T00:00:00.000Z",
    note: "External payroll vendor visibility"
  });

  assert.equal(internalInvite.status, "pending");
  assert.equal(externalInvite.status, "approval_required");
  assert.match(externalInvite.policyWarning, /External invite requires approval/);
  assert.ok(services.audit.list().some((event) => event.action === "app.invitation.created" && event.resourceId === internalInvite.id));
  assert.ok(services.audit.list().some((event) => event.action === "app.invitation.policy_required" && event.resourceId === externalInvite.id));
});

test("access request approval assigns app member and audit trail", () => {
  const { services, creator, project } = createSprint6Fixture();
  const request = services.appAccess.createAccessRequest(creator, project.id, {
    requesterEmail: "manager@company.com",
    requestedRoleKey: "manager",
    reason: "Needs approval queue access"
  });

  const decision = services.appAccess.decideAccessRequest(creator, project.id, {
    requestId: request.id,
    decision: "approved",
    decidedByUserId: creator.id
  });
  const snapshot = services.appAccess.getSnapshot(creator, project.id);

  assert.equal(decision.status, "approved");
  assert.ok(snapshot.members.some((member) => member.email === "manager@company.com" && member.roleKey === "manager"));
  assert.ok(services.audit.list().some((event) => event.action === "app.access_request.approved" && event.resourceId === request.id));
});

test("publish review manifest references PRD frontend auth roles database and route metadata", () => {
  const { services, creator, project } = createSprint6Fixture();

  const review = services.publish.getReview(creator, project.id);

  assert.equal(review.ready, true);
  assert.equal(review.manifest.app.slug, "leave-management-sprint6");
  assert.equal(review.manifest.auth.mode, "platform_auth_sdk");
  assert.equal(review.manifest.prd.version, "1.0");
  assert.match(review.manifest.frontend.checkpointId, /^fechk_/);
  assert.equal(review.manifest.database.schemaName, "app_leave_management_sprint6");
  assert.ok(review.manifest.roles.some((role) => role.key === "employee"));
  assert.ok(review.checklist.every((item) => item.status === "pass"));
});

test("publish creates deployment record and app store registry entry", () => {
  const { services, creator, project } = createSprint6Fixture();

  const result = services.publish.publishApp(creator, project.id);
  const registry = services.publish.listRegistry(creator);

  assert.equal(result.publishRequest.status, "published");
  assert.equal(result.deployment.status, "published");
  assert.equal(result.registryEntry.slug, "leave-management-sprint6");
  assert.ok(registry.some((entry) => entry.slug === "leave-management-sprint6"));
  assert.ok(services.audit.list().some((event) => event.action === "app.publish.completed" && event.resourceId === result.publishRequest.id));
});

test("publish blocks missing checklist items and denies end users", () => {
  const { services, creator, endUser } = createSprint6Fixture();
  const incompleteProject = services.projects.createProject({
    actor: creator,
    name: "Incomplete App",
    slug: "incomplete-app",
    appType: "Workflow App"
  });

  assert.throws(() => services.publish.publishApp(creator, incompleteProject.id), /Publish blocked/);
  assert.throws(() => services.publish.publishApp(endUser, incompleteProject.id), /Role end_user cannot access this resource/);
});
