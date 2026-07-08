// tests/unit/workspace-routes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceRoutes, resolvePreviewTarget } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/routes.ts"
);
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

function fixture() {
  const orchestrator = createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine()
  });
  const creator = { userId: "u-creator", roles: ["creator"], projectIds: ["p1"] };
  const outsider = { userId: "u-outsider", roles: ["creator"], projectIds: [] };
  const routes = createWorkspaceRoutes({ orchestrator });
  return { orchestrator, routes, creator, outsider };
}

test("creator can provision a workspace and read names-only secrets", async () => {
  const { routes, creator } = fixture();
  const created = await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });
  assert.equal(created.status, 201);
  assert.equal(created.body.workspace.state, "running");

  const detail = await routes.get(creator, { projectId: "p1" });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.secretNames.includes("DATABASE_URL"));
  assert.ok(!JSON.stringify(detail.body).includes("postgresql://"), "no secret values in response");
});

test("non-member gets 403 on provision and get", async () => {
  const { routes, creator, outsider } = fixture();
  await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });
  assert.equal((await routes.provision(outsider, { projectId: "p1", slug: "x-y-z" })).status, 403);
  assert.equal((await routes.get(outsider, { projectId: "p1" })).status, 403);
});

test("preview target resolves for members, wakes idle workspaces, rejects others", async () => {
  const { orchestrator, routes, creator, outsider } = fixture();
  await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });

  const ok = await resolvePreviewTarget(orchestrator, creator, "leave-tracker");
  assert.deepEqual(ok, { ok: true, upstream: "http://evcp-ws-leave-tracker:3000" });

  await orchestrator.stopWorkspace("p1");
  const woken = await resolvePreviewTarget(orchestrator, creator, "leave-tracker");
  assert.equal(woken.ok, true);
  assert.equal(orchestrator.getWorkspace("p1").state, "running");

  assert.deepEqual(await resolvePreviewTarget(orchestrator, outsider, "leave-tracker"), { ok: false, status: 403 });
  assert.deepEqual(await resolvePreviewTarget(orchestrator, null, "leave-tracker"), { ok: false, status: 401 });
  assert.deepEqual(await resolvePreviewTarget(orchestrator, creator, "no-such-app"), { ok: false, status: 404 });
});
