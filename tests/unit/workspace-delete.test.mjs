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

function makeOrchestrator() {
  const released = [];
  const deps = {
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    onAudit: (e) => released.push(e.action)
  };
  return { orchestrator: createWorkspaceOrchestrator(deps), deps, audits: released };
}

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
