import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceOrchestrator } =
  await import("../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts");
const { createMemoryDockerEngine } =
  await import("../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts");
const { createPgClientPostgresProvisioner } =
  await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } =
  await import("../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts");
const { createProjectSecretStore } =
  await import("../../apps/platform-api/src/workspace-orchestrator/secret-store.ts");

function createFixture(image = "evcp/workspace-next:v1") {
  const audits = [];
  const snapshots = new Map();
  const runtimeRecords = {
    async list() {
      return [...snapshots.values()];
    },
    async save(snapshot) {
      snapshots.set(snapshot.record.projectId, structuredClone(snapshot));
    },
    async remove(projectId) {
      snapshots.delete(projectId);
    }
  };
  const deps = {
    image,
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    runtimeRecords,
    onAudit: (event) => audits.push(event)
  };
  return { deps, runtimeRecords, audits };
}

test("recovery recreates a stopped container that exits before preview readiness", async () => {
  const { deps, audits } = createFixture();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const first = await orchestrator.provisionWorkspace({
    projectId: "prj-recover",
    slug: "recover"
  });
  await deps.docker.stopContainer(first.containerId);
  const execInContainer = deps.docker.execInContainer.bind(deps.docker);
  deps.docker.execInContainer = async (containerId, cmd) => {
    if (containerId === first.containerId) {
      await deps.docker.stopContainer(containerId);
      throw new Error("docker engine exec-create failed (409): container is not running");
    }
    return execInContainer(containerId, cmd);
  };

  const recovered = await orchestrator.provisionWorkspace({
    projectId: "prj-recover",
    slug: "recover"
  });

  assert.notEqual(recovered.containerId, first.containerId);
  assert.equal(deps.docker.state.containers.length, 1);
  assert.equal(deps.docker.state.containers[0].status, "running");
  assert.ok(
    audits.some(
      (event) => event.action === "workspace.recovered" && event.metadata?.mode === "recreated"
    )
  );
});

test("recovery upgrades an idle runtime from an older workspace image", async () => {
  const { deps, runtimeRecords } = createFixture();
  const firstOrchestrator = createWorkspaceOrchestrator(deps);
  const first = await firstOrchestrator.provisionWorkspace({
    projectId: "prj-recover",
    slug: "recover"
  });
  await firstOrchestrator.stopWorkspace("prj-recover");
  const upgraded = createWorkspaceOrchestrator({ ...deps, image: "evcp/workspace-next:v2" });
  await upgraded.hydrateRuntimeRecords(runtimeRecords);

  const recovered = await upgraded.provisionWorkspace({
    projectId: "prj-recover",
    slug: "recover"
  });

  assert.notEqual(recovered.containerId, first.containerId);
  assert.equal(deps.docker.state.containers.length, 1);
  assert.equal(deps.docker.state.containers[0].spec.image, "evcp/workspace-next:v2");
});

test("opening an active project after platform deploy preserves its container and compile cache", async () => {
  const { deps, runtimeRecords } = createFixture();
  const original = createWorkspaceOrchestrator(deps);
  const first = await original.provisionWorkspace({ projectId: "prj-active", slug: "active" });
  const upgraded = createWorkspaceOrchestrator({ ...deps, image: "evcp/workspace-next:v2" });
  await upgraded.hydrateRuntimeRecords(runtimeRecords);
  const opened = await upgraded.provisionWorkspace({ projectId: "prj-active", slug: "active" });
  assert.equal(opened.containerId, first.containerId);
  assert.equal(deps.docker.state.containers[0].spec.image, "evcp/workspace-next:v1");
});
