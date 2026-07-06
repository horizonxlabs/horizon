import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { toWorkspaceAuthContext, createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("service container exposes workspace orchestrator", () => {
  const services = createPlatformApiServices();
  assert.ok(services.workspaceOrchestrator, "workspaceOrchestrator missing on services");
  assert.equal(typeof services.workspaceOrchestrator.provisionWorkspace, "function");
  assert.equal(typeof services.workspaceOrchestrator.getWorkspace, "function");
});

test("toWorkspaceAuthContext maps user to auth context", () => {
  const ctx = toWorkspaceAuthContext({ id: "u1", roles: ["admin"], projectIds: ["p1"] });
  assert.deepEqual(ctx, { userId: "u1", roles: ["admin"], projectIds: ["p1"] });

  const empty = toWorkspaceAuthContext({ id: "u2" });
  assert.deepEqual(empty, { userId: "u2", roles: [], projectIds: [] });
});

test("createDefaultWorkspaceOrchestrator provisions a workspace", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "demo-app" });
  assert.equal(record.state, "running");
  assert.ok(orchestrator.listSecretNames("p1").includes("DATABASE_URL"));
});
