import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts"
);
const { createPgClientPostgresProvisioner } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts"
);
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts"
);
const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);
const { createMemoryDockerEngine } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

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

test("provisionWorkspace creates schema, bucket, llm key, secrets and running container", async () => {
  const { deps, executedSql, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const record = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });

  assert.equal(record.state, "running");
  assert.equal(record.slug, "leave-tracker");
  assert.ok(record.containerId);
  assert.ok(executedSql.some((sql) => sql.includes("CREATE SCHEMA")));
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-leave-tracker"]);
  assert.equal(deps.llmGateway.state.keys.length, 1);
  assert.deepEqual(orchestrator.listSecretNames("p1").sort(), [
    "DATABASE_URL",
    "LLM_GATEWAY_KEY",
    "S3_ACCESS_KEY",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_SECRET_KEY"
  ]);
  assert.equal(deps.docker.state.containers[0].status, "running");
  assert.ok(
    deps.docker.state.containers[0].spec.env.some((entry) => entry.startsWith("DATABASE_URL="))
  );
  assert.ok(audits.some((event) => event.action === "workspace.provisioned"));
});

test("provisioning rolls back everything when container start fails", async () => {
  const { deps } = createDeps();
  deps.docker.startContainer = async () => {
    throw new Error("docker daemon exploded");
  };
  const orchestrator = createWorkspaceOrchestrator(deps);
  await assert.rejects(
    () => orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" }),
    /docker daemon exploded/
  );
  assert.deepEqual(deps.objectStorage.state.buckets, [], "bucket must be rolled back");
  assert.equal(deps.llmGateway.state.keys[0].revoked, true, "llm key must be revoked");
  assert.deepEqual(orchestrator.listSecretNames("p1"), [], "secrets must be cleared");
  const record = orchestrator.getWorkspace("p1");
  assert.equal(record.state, "failed");
});

test("duplicate provisioning for same project is idempotent (returns the existing workspace)", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const first = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const second = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  assert.equal(second.id, first.id);
  assert.equal(second.containerId, first.containerId);
  assert.equal(second.projectId, "p1");
});

test("provision self-heals to the existing container after a restart (empty records, same docker)", async () => {
  const { deps } = createDeps();
  const first = await createWorkspaceOrchestrator(deps).provisionWorkspace({
    projectId: "p1",
    slug: "leave-tracker"
  });
  // Simulate a platform-api restart: a fresh orchestrator (empty in-memory records) sharing the
  // same docker engine (the container is still running). Provision must re-attach, not re-provision.
  const healed = await createWorkspaceOrchestrator(deps).provisionWorkspace({
    projectId: "p1",
    slug: "leave-tracker"
  });
  assert.equal(healed.containerId, first.containerId);
  assert.equal(healed.state, "running");
});

test("stop/wake cycle follows state machine and audits", async () => {
  const { deps, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const idle = await orchestrator.stopWorkspace("p1");
  assert.equal(idle.state, "idle");
  const awake = await orchestrator.wakeWorkspace("p1");
  assert.equal(awake.state, "running");
  assert.ok(audits.some((event) => event.action === "workspace.stopped"));
  assert.ok(audits.some((event) => event.action === "workspace.started"));
});

test("stopIdleWorkspaces stops containers idle for 30+ minutes", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const future = new Date(Date.now() + 31 * 60 * 1000);
  const stopped = await orchestrator.stopIdleWorkspaces(future);
  assert.deepEqual(stopped, ["p1"]);
  assert.equal(orchestrator.getWorkspace("p1").state, "idle");
});

test("archiveWorkspace stops container but keeps volume resources", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const record = await orchestrator.archiveWorkspace("p1");
  assert.equal(record.state, "archived");
  assert.equal(deps.docker.state.containers.length, 0, "container removed");
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-leave-tracker"], "bucket retained");
});
