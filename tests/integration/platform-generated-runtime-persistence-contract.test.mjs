import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryGeneratedRuntimePersistenceClient,
  createGeneratedRuntimeRepositoryBackedService
} from "../../apps/platform-api/src/persistence/generated-runtime-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const repositorySource = readFileSync(
  "apps/platform-api/src/persistence/generated-runtime-repositories.ts",
  "utf8"
);
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

const adminActor = {
  id: "usr_admin",
  email: "admin@company.com",
  name: "Admin User",
  role: "admin",
  status: "active",
  permissions: ["platform:admin"]
};

const creatorActor = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["project:create"]
};

const project = {
  id: "prj_runtime_persisted",
  slug: "runtime-persisted",
  name: "Runtime Persisted",
  status: "published",
  ownerUserId: "usr_creator",
  appType: "Workflow App",
  businessProblem: "Employees need persisted runtime evidence",
  targetDepartment: "HR Department",
  intendedUsers: ["Employee", "Manager"],
  dataSensitivity: "internal",
  appId: "app_runtime_persisted",
  createdAt: "2026-07-04T00:00:00.000Z"
};

const manifest = {
  id: "manifest_app_runtime_persisted_v1",
  appId: project.appId,
  projectId: project.id,
  manifestVersion: "1",
  app: {
    id: project.appId,
    slug: project.slug,
    name: project.name,
    route: "/apps/runtime-persisted",
    status: "published"
  },
  prd: {
    versionId: "prdver_runtime_persisted_baseline",
    version: "1.0"
  },
  frontend: {
    checkpointId: "preview_runtime_persisted_0001",
    version: "preview-0001",
    checksum: "sha256:runtimepersisted",
    routes: ["/apps/runtime-persisted"]
  },
  auth: {
    mode: "platform_auth_sdk",
    accessMode: "restricted"
  },
  roles: [{ key: "employee", name: "Employee", permissions: ["leave:view-own"] }],
  database: {
    schemaName: "app_runtime_persisted",
    tables: ["leave_requests", "approval_steps"]
  },
  generatedAt: "2026-07-04T00:10:00.000Z"
};

const deployment = {
  id: "dep_runtime_persisted_001",
  projectId: project.id,
  appId: project.appId,
  publishRequestId: "pubreq_runtime_persisted_0001",
  status: "published",
  environment: "app_store",
  route: "/apps/runtime-persisted",
  manifestVersion: "1",
  prdVersion: "1.0",
  frontendCheckpointId: "preview_runtime_persisted_0001",
  publishedByUserId: "usr_creator",
  publishedAt: "2026-07-04T00:12:00.000Z"
};

test("Generated runtime persistence service stores overview health OpenAPI and migration reports", async () => {
  const service = createGeneratedRuntimeRepositoryBackedService(
    new MemoryGeneratedRuntimePersistenceClient()
  );

  const overview = await service.getRuntimeOverview(adminActor, { project, manifest, deployment });
  const health = await service.getRuntimeHealth(adminActor, { project, manifest, deployment });
  const openApi = await service.getOpenApiContract(adminActor, { project, manifest, deployment });
  const blocked = await service.runMigrationDryRun(adminActor, {
    project,
    manifest,
    deployment,
    migrationId: "mig_drop_leave_balance",
    destructiveChanges: ["drop_column:leave_requests.balance_snapshot"],
    approvalId: ""
  });
  const afterBlocked = await service.getRuntimeOverview(adminActor, {
    project,
    manifest,
    deployment
  });

  assert.equal(overview.projectId, project.id);
  assert.equal(overview.appId, project.appId);
  assert.equal(overview.deploymentId, deployment.id);
  assert.equal(overview.artifactContract.root, "generated-apps/runtime-persisted");
  assert.equal(overview.container.status, "running");
  assert.equal(overview.schemaIsolation.schemaName, "app_runtime_persisted");
  assert.deepEqual(overview.schemaIsolation.allowedSchemas, ["app_runtime_persisted"]);
  assert.ok(overview.schemaIsolation.deniedSchemas.includes("app_payroll"));
  assert.equal(health.health.status, "healthy");
  assert.equal(health.readiness.ready, true);
  assert.equal(openApi.pathCount, 4);
  assert.ok(openApi.paths.includes("/api/leave-requests"));
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.requiredApprovals.includes("Data Owner"));
  assert.equal(afterBlocked.migrationDryRun.migrationId, "mig_drop_leave_balance");
  assert.equal(afterBlocked.migrationDryRun.status, "blocked");
});

test("Generated runtime persistence service enforces admin-only access and schema isolation", async () => {
  const service = createGeneratedRuntimeRepositoryBackedService(
    new MemoryGeneratedRuntimePersistenceClient()
  );

  await assert.rejects(
    () => service.getRuntimeOverview(creatorActor, { project, manifest, deployment }),
    /Role creator cannot access this resource/
  );

  const allowed = await service.checkSchemaAccess(adminActor, {
    project,
    manifest,
    deployment,
    attemptedSchema: "app_runtime_persisted",
    operation: "select"
  });
  const denied = await service.checkSchemaAccess(adminActor, {
    project,
    manifest,
    deployment,
    attemptedSchema: "app_payroll",
    operation: "select"
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, "assigned_schema_allowed");
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "cross_schema_access_denied");
  assert.match(denied.evidence, /app_user_runtime_persisted/);
});

test("runtime persistence wiring exposes Generated Runtime service and routes", () => {
  assert.match(
    appFactory,
    /generatedRuntimePersistence\?: GeneratedRuntimeRepositoryBackedService/
  );
  assert.match(
    appFactory,
    /createGeneratedRuntimeRepositoryBackedService\(\s*new MemoryGeneratedRuntimePersistenceClient\(\)\s*\)/
  );
  assert.match(appFactory, /createPrismaGeneratedRuntimePersistence\(\s*env\.DATABASE_URL\s*\)/);
  assert.match(appFactory, /isPersistenceGeneratedRuntimeRoute/);
  assert.match(repositorySource, /generatedAppRuntime/);
  assert.match(repositorySource, /generatedAppSchemaGrant/);
  assert.match(repositorySource, /generatedAppHealthCheck/);
  assert.match(repositorySource, /generatedAppRuntimeLog/);
  assert.match(repositorySource, /generatedAppRuntimeMetric/);
  assert.match(repositorySource, /generatedAppOpenApiContract/);
  assert.match(repositorySource, /generatedAppMigrationReport/);
  assert.match(persistenceDoc, /Generated Runtime Route-Level Coverage/);
});
