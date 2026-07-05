import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint5Fixture() {
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
    slug: "leave-management-sprint5",
    appType: "Workflow App",
    businessProblem: "Employees need self-service leave requests",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Add WFH leave type" });
  services.workspace.submitPrompt(creator, project.id, { prompt: "Improve manager dashboard" });

  return { services, admin, creator, project };
}

test("database view exposes read-only schema relationships migrations and sample records", () => {
  const { services, creator, project } = createSprint5Fixture();

  const database = services.databaseView.getDatabaseView(creator, project.id);

  assert.equal(database.readOnly, true);
  assert.ok(database.tables.length >= 3);
  assert.ok(database.tables.some((table) => table.key === "leave_requests"));
  assert.ok(database.relationships.some((relationship) => relationship.sourceTable === "leave_requests"));
  assert.ok(database.migrations.some((migration) => migration.status === "applied"));

  const records = services.databaseView.listSampleRecords(creator, project.id, "leave_requests");
  assert.ok(records.length > 0);
  assert.equal(records[0].tableKey, "leave_requests");
  assert.throws(() => services.databaseView.executeRawSql(creator, project.id, "DROP TABLE leave_requests"), /Raw SQL is not available/);
});

test("database metadata and frontend restore are denied for unauthorized end users", () => {
  const { services, project } = createSprint5Fixture();
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });

  assert.throws(() => services.databaseView.getDatabaseView(endUser, project.id), /cannot access/i);
  assert.throws(() => services.frontendVersions.listCheckpoints(endUser, project.id), /cannot access/i);
});

test("frontend restore creates a new active checkpoint and preserves non-frontend boundaries", () => {
  const { services, creator, project } = createSprint5Fixture();
  const before = services.frontendVersions.captureBoundarySnapshot(creator, project.id);
  const checkpointsBefore = services.frontendVersions.listCheckpoints(creator, project.id);
  const restoreSource = checkpointsBefore.find((checkpoint) => checkpoint.version === "fe-0001");

  assert.ok(restoreSource);
  const restore = services.frontendVersions.restoreFrontend(creator, project.id, restoreSource.id);
  const after = services.frontendVersions.captureBoundarySnapshot(creator, project.id);
  const checkpointsAfter = services.frontendVersions.listCheckpoints(creator, project.id);

  assert.equal(restore.boundary.frontendChanged, true);
  assert.deepEqual(restore.boundary.unchanged, ["backend", "database", "auth", "app_roles", "membership", "domain", "prd_baseline"]);
  assert.equal(restore.checkpoint.status, "current");
  assert.equal(checkpointsAfter.filter((checkpoint) => checkpoint.status === "current").length, 1);
  assert.equal(checkpointsAfter.length, checkpointsBefore.length + 1);
  assert.deepEqual(after, before);
  assert.ok(services.audit.list().some((event) => event.action === "frontend.restore.completed" && event.resourceId === restore.checkpoint.id));
});
