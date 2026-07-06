import test from "node:test";
import assert from "node:assert/strict";
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { resolvePreviewProxyDecision } = await import("../../apps/platform-api/src/app-factory.ts");

const CREATOR = { "x-mock-user-email": "creator@company.com" };

test("preview decision: 401 unauth, 404 unknown slug, upstream for member", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser(CREATOR);
  const projectId = services.projects.listProjects(creator)[0].id;
  await services.workspaceOrchestrator.provisionWorkspace({ projectId, slug: "leave-tracker" });

  assert.deepEqual(await resolvePreviewProxyDecision(services, {}, "leave-tracker"), { status: 401 });
  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, "no-such-slug"), { status: 404 });
  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, "leave-tracker"), { upstream: "http://evcp-ws-leave-tracker:3000" });
});
