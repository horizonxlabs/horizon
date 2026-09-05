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
const { WorkspaceRuntimeRepositoryBackedStore } = await import(
  "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts"
);
const { deleteWorkspaceResources } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/workspace-deletion.ts"
);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeOrchestrator(runtimeRecords) {
  const released = [];
  const deps = {
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    onAudit: (e) => released.push(e.action),
    runtimeRecords
  };
  return { orchestrator: createWorkspaceOrchestrator(deps), deps, audits: released };
}

test("delete uses a persisted physical resource key", async () => {
  const releasedSchemas = [];
  const removedVolumes = [];
  const { deps } = makeOrchestrator();
  const record = {
    id: "ws-prj-leave-tracker",
    projectId: "prj-leave-tracker",
    slug: "leave-tracker",
    resourceKey: "warm-slot-abc",
    state: "running",
    containerId: null,
    cpuCores: 1,
    memoryMb: 2048,
    lastActivityAt: "2026-09-05T00:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z"
  };
  deps.postgres.releaseSchema = async (schema) => releasedSchemas.push(schema);
  deps.docker.removeVolume = async (volume) => removedVolumes.push(volume);

  await deleteWorkspaceResources({ record, deps, llmGatewayKeyId: "key-1" });

  assert.deepEqual(releasedSchemas, ["warm-slot-abc"]);
  assert.deepEqual(removedVolumes, ["evcp-ws-warm-slot-abc-data"]);
});

test("deleteWorkspace releases schema, bucket, llm key, secrets, container and drops the record", async () => {
  const { orchestrator, deps, audits } = makeOrchestrator();
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-prj-leave-tracker"]);
  assert.equal(deps.llmGateway.state.keys[0].revoked, false);

  await orchestrator.deleteWorkspace("prj-leave-tracker");

  assert.deepEqual(deps.objectStorage.state.buckets, [], "bucket released");
  assert.equal(deps.llmGateway.state.keys[0].revoked, true, "llm key revoked");
  assert.deepEqual(await orchestrator.listSecretNames("prj-leave-tracker"), [], "secrets cleared");
  assert.deepEqual(deps.docker.state.containers, [], "container removed");
  assert.deepEqual(deps.docker.state.volumes, [], "workspace volume removed");
  assert.equal(orchestrator.getWorkspace("prj-leave-tracker"), null, "record dropped");
  assert.ok(audits.includes("workspace.deleted"), "audited");
});

test("deleteWorkspace on unknown project is a no-op (idempotent)", async () => {
  const { orchestrator } = makeOrchestrator();
  await orchestrator.deleteWorkspace("nope"); // must not throw
  assert.equal(orchestrator.getWorkspace("nope"), null);
});

test("deleteWorkspace aggregates failures, attempts every release, and remains retryable", async () => {
  const { orchestrator, deps } = makeOrchestrator();
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  const releaseSchema = deps.postgres.releaseSchema;
  deps.postgres.releaseSchema = async () => {
    throw new Error("pg down");
  };
  await assert.rejects(
    orchestrator.deleteWorkspace("prj-leave-tracker"),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some((cause) => cause instanceof Error && cause.message === "pg down")
  );
  assert.deepEqual(
    deps.objectStorage.state.buckets,
    [],
    "bucket still released despite pg failure"
  );
  assert.deepEqual(deps.docker.state.containers, [], "container release was still attempted");
  assert.deepEqual(deps.docker.state.volumes, [], "volume release was still attempted");
  assert.equal(orchestrator.getWorkspace("prj-leave-tracker")?.projectId, "prj-leave-tracker");

  deps.postgres.releaseSchema = releaseSchema;
  await orchestrator.deleteWorkspace("prj-leave-tracker");
  assert.equal(orchestrator.getWorkspace("prj-leave-tracker"), null, "retry completed deletion");
});

test("deleteWorkspace aggregates runtime persistence failure and retains retry state", async () => {
  const rows = new Map();
  const databaseError = new Error("runtime database unavailable");
  let removeError = databaseError;
  const runtimeRecords = new WorkspaceRuntimeRepositoryBackedStore({
    workspaceRuntimeRecord: {
      async findMany() { return [...rows.values()]; },
      async upsert({ where, update, create }) {
        const next = rows.has(where.projectId) ? { ...rows.get(where.projectId), ...update } : create;
        rows.set(where.projectId, next);
        return next;
      },
      async deleteMany({ where }) {
        if (removeError) throw removeError;
        return { count: rows.delete(where.projectId) ? 1 : 0 };
      }
    }
  });
  const { orchestrator } = makeOrchestrator(runtimeRecords);
  await orchestrator.provisionWorkspace({
    projectId: "prj-leave-tracker",
    slug: "leave-tracker"
  });

  await assert.rejects(
    orchestrator.deleteWorkspace("prj-leave-tracker"),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some((cause) => cause === databaseError)
  );
  assert.equal(
    orchestrator.getWorkspace("prj-leave-tracker")?.projectId,
    "prj-leave-tracker",
    "in-process retry state is retained"
  );
  assert.equal(rows.has("prj-leave-tracker"), true, "durable retry state is retained");

  removeError = undefined;
  await orchestrator.deleteWorkspace("prj-leave-tracker");
  assert.equal(orchestrator.getWorkspace("prj-leave-tracker"), null);
  assert.equal(rows.has("prj-leave-tracker"), false);
});

test("deleteWorkspace stops between actual resource stages after deletion-fence takeover", async () => {
  const { orchestrator, deps } = makeOrchestrator();
  await orchestrator.provisionWorkspace({ projectId: "prj-leave-tracker", slug: "leave-tracker" });
  const stopFinished = deferred();
  const resumeStop = deferred();
  const originalStop = deps.docker.stopContainer.bind(deps.docker);
  let schemaReleases = 0;
  deps.docker.stopContainer = async (containerId) => {
    await originalStop(containerId);
    stopFinished.resolve();
    await resumeStop.promise;
  };
  deps.postgres.releaseSchema = async () => { schemaReleases += 1; };
  let current = true;
  const deletion = orchestrator.deleteWorkspace("prj-leave-tracker", {
    epoch: 1,
    async assertCurrent() { if (!current) throw new Error("deletion ownership lost"); }
  });
  await stopFinished.promise;
  current = false;
  resumeStop.resolve();

  await assert.rejects(deletion, /ownership lost/);
  assert.equal(deps.docker.state.containers.length, 1, "container removal must not run");
  assert.equal(deps.docker.state.volumes.length, 1, "volume removal must not run");
  assert.equal(schemaReleases, 0, "schema release must not run");
  assert.equal(deps.objectStorage.state.buckets.length, 1, "bucket release must not run");
});
