import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceOrchestrator } =
  await import("../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts");
const { createPgClientPostgresProvisioner } =
  await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } =
  await import("../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts");
const { createProjectSecretStore } =
  await import("../../apps/platform-api/src/workspace-orchestrator/secret-store.ts");
const { createMemoryDockerEngine } =
  await import("../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts");

function createDeps(overrides = {}) {
  const executedSql = [];
  const audits = [];
  const deps = {
    postgres: createPgClientPostgresProvisioner(async (sql) => executedSql.push(sql)),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    onAudit: (event) => audits.push(event),
    ...overrides
  };
  return { deps, executedSql, audits };
}

function createRuntimeRecordStore() {
  const snapshots = new Map();
  return {
    snapshots,
    async list() { return [...snapshots.values()]; },
    async save(snapshot) { snapshots.set(snapshot.record.projectId, structuredClone(snapshot)); },
    async remove(projectId) { snapshots.delete(projectId); }
  };
}

test("provisionWorkspace creates schema, bucket, llm key, secrets and running container", async () => {
  const { deps, executedSql, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });

  assert.equal(record.state, "running");
  assert.equal(record.slug, "leave-tracker");
  assert.equal(record.id, "ws-prj-leave-tracker");
  assert.ok(record.containerId);
  assert.ok(executedSql.some((sql) => sql.includes("CREATE SCHEMA")));
  assert.ok(executedSql.some((sql) => sql.includes("app_prj_leave_tracker")));
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-prj-leave-tracker"]);
  assert.equal(deps.llmGateway.state.keys.length, 1);
  assert.deepEqual(orchestrator.listSecretNames("prj-leave-tracker").sort(), [
    "DATABASE_URL",
    "LLM_GATEWAY_KEY",
    "S3_ACCESS_KEY",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_SECRET_KEY"
  ]);
  assert.equal(deps.docker.state.containers[0].status, "running");
  assert.equal(deps.docker.state.containers[0].spec.name, "evcp-ws-prj-leave-tracker");
  assert.ok(
    deps.docker.state.containers[0].spec.env.some((entry) => entry.startsWith("DATABASE_URL="))
  );
  assert.ok(
    deps.docker.state.containers[0].spec.env.some((entry) =>
      entry.includes("/preview/prj-leave-tracker")
    )
  );
  assert.ok(audits.some((event) => event.action === "workspace.provisioned"));
});

test("provisionWorkspace uses configured Postgres database name in workspace DATABASE_URL", async () => {
  const { deps } = createDeps({
    databaseName: "tenantdb",
    postgresHost: "pg.internal:5433"
  });
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });

  const databaseUrl = deps.docker.state.containers[0].spec.env.find((entry) =>
    entry.startsWith("DATABASE_URL=")
  );
  assert.match(databaseUrl, /^DATABASE_URL=postgresql:\/\/app_prj_leave_tracker_role:/);
  assert.match(databaseUrl, /@pg\.internal:5433\/tenantdb\?schema=app_prj_leave_tracker$/);
});

test("provisioning rolls back everything when container start fails", async () => {
  const { deps } = createDeps();
  deps.docker.startContainer = async () => {
    throw new Error("docker daemon exploded");
  };
  const orchestrator = createWorkspaceOrchestrator(deps);
  await assert.rejects(
    () =>
      orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" }),
    /docker daemon exploded/
  );
  assert.deepEqual(deps.objectStorage.state.buckets, [], "bucket must be rolled back");
  assert.equal(deps.llmGateway.state.keys[0].revoked, true, "llm key must be revoked");
  assert.deepEqual(
    orchestrator.listSecretNames("prj-leave-tracker"),
    [],
    "secrets must be cleared"
  );
  const record = orchestrator.getWorkspace("prj-leave-tracker");
  assert.equal(record.state, "failed");
  assert.equal(record.lastError, "docker daemon exploded");
});

test("duplicate provisioning for same project is idempotent (returns the existing workspace)", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const first = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  const second = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  assert.equal(second.id, first.id);
  assert.equal(second.containerId, first.containerId);
  assert.equal(second.projectId, "prj-leave-tracker");
});

test("provisionWorkspace restarts a workspace container killed outside the orchestrator", async () => {
  const { deps, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const first = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  await deps.docker.stopContainer(first.containerId);

  const recovered = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });

  assert.equal(recovered.containerId, first.containerId);
  assert.equal(recovered.state, "running");
  assert.equal(deps.docker.state.containers.length, 1);
  assert.equal(deps.docker.state.containers[0].status, "running");
  assert.ok(audits.some((event) => event.action === "workspace.recovered"));
});

test("provisionWorkspace replaces a deleted container without reprovisioning project resources", async () => {
  const { deps, executedSql, audits } = createDeps();
  let createCalls = 0;
  const createContainer = deps.docker.createContainer.bind(deps.docker);
  deps.docker.createContainer = async (spec) => {
    createCalls += 1;
    return createContainer(spec);
  };
  const orchestrator = createWorkspaceOrchestrator(deps);
  const first = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  await deps.docker.removeContainer(first.containerId);

  const recovered = await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });

  assert.equal(createCalls, 2);
  assert.equal(recovered.containerId, deps.docker.state.containers[0].containerId);
  assert.equal(recovered.state, "running");
  assert.equal(deps.docker.state.containers.length, 1);
  assert.equal(executedSql.filter((sql) => sql.includes("CREATE SCHEMA")).length, 1);
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-prj-leave-tracker"]);
  assert.equal(deps.llmGateway.state.keys.length, 1);
  assert.ok(audits.some((event) => event.action === "workspace.recovered"));
});

test("provision self-heals to the existing container after a restart (empty records, same docker)", async () => {
  const { deps } = createDeps();
  const first = await createWorkspaceOrchestrator(deps).provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  // Simulate a platform-api restart: a fresh orchestrator (empty in-memory records) sharing the
  // same docker engine (the container is still running) but an empty secret store. Provision must
  // re-attach, not re-provision, and recover its database connection from the container env.
  const restartedDeps = {
    ...deps,
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") })
  };
  const healed = await createWorkspaceOrchestrator(restartedDeps).provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });
  assert.equal(healed.containerId, first.containerId);
  assert.equal(healed.state, "running");
  assert.match(
    createWorkspaceOrchestrator(restartedDeps).getProjectDatabaseUrl("prj-leave-tracker"),
    /^postgresql:\/\/app_prj_leave_tracker_role:/
  );
});

test("runtime records hydrate lifecycle state and persist transitions across an API restart", async () => {
  const { deps } = createDeps();
  const runtimeRecords = createRuntimeRecordStore();
  const first = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
  await first.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  await first.stopWorkspace("prj-leave-tracker");
  assert.equal(runtimeRecords.snapshots.get("prj-leave-tracker").record.state, "idle");

  const restarted = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
  await restarted.hydrateRuntimeRecords(runtimeRecords);
  assert.equal(restarted.getWorkspace("prj-leave-tracker").state, "idle");
  await restarted.wakeWorkspace("prj-leave-tracker");
  assert.equal(runtimeRecords.snapshots.get("prj-leave-tracker").record.state, "running");
});

test("stop/wake cycle follows state machine and audits", async () => {
  const { deps, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  const idle = await orchestrator.stopWorkspace("prj-leave-tracker");
  assert.equal(idle.state, "idle");
  const awake = await orchestrator.wakeWorkspace("prj-leave-tracker");
  assert.equal(awake.state, "running");
  assert.ok(audits.some((event) => event.action === "workspace.stopped"));
  assert.ok(audits.some((event) => event.action === "workspace.started"));
});

test("stopIdleWorkspaces stops containers idle for 30+ minutes", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  const future = new Date(Date.now() + 31 * 60 * 1000);
  const stopped = await orchestrator.stopIdleWorkspaces(future);
  assert.deepEqual(stopped, ["prj-leave-tracker"]);
  assert.equal(orchestrator.getWorkspace("prj-leave-tracker").state, "idle");
});

test("archiveWorkspace stops container but keeps volume resources", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  const record = await orchestrator.archiveWorkspace("prj-leave-tracker");
  assert.equal(record.state, "archived");
  assert.equal(deps.docker.state.containers.length, 0, "container removed");
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-prj-leave-tracker"], "bucket retained");
});
