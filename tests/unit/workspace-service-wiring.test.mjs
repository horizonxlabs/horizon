import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);
const { createDefaultWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/factory.ts"
);

test("service container exposes workspace orchestrator", () => {
  const services = createPlatformApiServices();
  assert.ok(services.workspaceOrchestrator, "workspaceOrchestrator missing on services");
  assert.equal(typeof services.workspaceOrchestrator.provisionWorkspace, "function");
  assert.equal(typeof services.workspaceOrchestrator.getWorkspace, "function");
});

test("createDefaultWorkspaceOrchestrator provisions a workspace", async () => {
  const orchestrator = createDefaultWorkspaceOrchestrator();
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj-demo-app",
    slug: "demo-app"
  });
  assert.equal(record.state, "running");
  assert.ok((await orchestrator.listSecretNames("prj-demo-app")).includes("DATABASE_URL"));
});
