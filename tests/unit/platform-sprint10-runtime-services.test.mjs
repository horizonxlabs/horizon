import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint10Fixture() {
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
    name: "Leave Management Runtime",
    appType: "Workflow App",
    businessProblem: "Employees need production leave workflow",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Add WFH leave type" });
  const publish = services.publish.publishApp(creator, project.id);

  return { services, admin, creator, project, publish };
}

test("runtime overview exposes generated app artifact container schema health OpenAPI and migration contracts", () => {
  const { services, admin, project, publish } = createSprint10Fixture();

  const runtime = services.generatedRuntime.getRuntimeOverview(admin, project.id);

  assert.equal(runtime.projectId, project.id);
  assert.equal(runtime.appId, publish.manifest.appId);
  assert.equal(runtime.deploymentId, publish.deployment.id);
  assert.equal(runtime.artifactContract.root, `generated-apps/${project.appId}`);
  assert.deepEqual(runtime.artifactContract.requiredPaths, [
    "app.manifest.json",
    "package.json",
    "frontend/",
    "backend/",
    "prisma/",
    "openapi/",
    "tests/",
    "README.md"
  ]);
  assert.equal(runtime.container.status, "running");
  assert.match(runtime.container.containerName, new RegExp(`^evcp-app-${project.appId}-`));
  assert.match(runtime.container.imageTag, new RegExp(`^${project.appId}:`));
  assert.equal(runtime.container.healthEndpoint, `/apps/${project.appId}/health`);
  assert.equal(runtime.container.readyEndpoint, `/apps/${project.appId}/ready`);
  assert.equal(runtime.container.metricsEndpoint, `/apps/${project.appId}/metrics`);
  assert.equal(runtime.schemaIsolation.schemaName, `app_${project.id}`);
  assert.equal(runtime.schemaIsolation.dbUser, `app_user_${project.appId}`);
  assert.deepEqual(runtime.schemaIsolation.allowedSchemas, [`app_${project.id}`]);
  assert.ok(runtime.schemaIsolation.deniedSchemas.includes("app_payroll"));
  assert.equal(runtime.health.status, "healthy");
  assert.equal(runtime.readiness.ready, true);
  assert.equal(runtime.logSample.appId, publish.manifest.appId);
  assert.equal(runtime.logSample.deploymentId, publish.deployment.id);
  assert.equal(runtime.metrics.requestCount, 128);
  assert.equal(runtime.openApi.pathCount > 0, true);
  assert.equal(runtime.migrationDryRun.status, "passed");
  assert.equal(runtime.migrationDryRun.deploymentId, publish.deployment.id);
});

test("schema isolation check allows assigned schema and denies cross schema access", () => {
  const { services, admin, project } = createSprint10Fixture();

  const allowed = services.generatedRuntime.checkSchemaAccess(admin, project.id, {
    attemptedSchema: `app_${project.id}`,
    operation: "select"
  });
  const denied = services.generatedRuntime.checkSchemaAccess(admin, project.id, {
    attemptedSchema: "app_payroll",
    operation: "select"
  });

  assert.equal(allowed.allowed, true);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "cross_schema_access_denied");
  assert.ok(denied.evidence.includes(`app_user_${project.appId}`));
});

test("runtime hardening evidence is restricted to platform admins", () => {
  const { services, creator, project } = createSprint10Fixture();

  assert.throws(
    () => services.generatedRuntime.getRuntimeOverview(creator, project.id),
    /Role creator cannot access this resource/
  );
});

test("migration dry-run blocks destructive changes unless approval is present", () => {
  const { services, admin, project } = createSprint10Fixture();

  const destructive = services.generatedRuntime.runMigrationDryRun(admin, project.id, {
    migrationId: "mig_drop_leave_balance",
    destructiveChanges: ["drop_column:leave_requests.balance_snapshot"],
    approvalId: ""
  });
  const approved = services.generatedRuntime.runMigrationDryRun(admin, project.id, {
    migrationId: "mig_add_leave_comment",
    destructiveChanges: [],
    approvalId: ""
  });

  assert.equal(destructive.status, "blocked");
  assert.ok(destructive.requiredApprovals.includes("Developer Reviewer"));
  assert.ok(destructive.requiredApprovals.includes("Data Owner"));
  assert.equal(approved.status, "passed");
  assert.deepEqual(approved.destructiveChanges, []);
});
