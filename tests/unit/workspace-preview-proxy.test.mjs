import test from "node:test";
import assert from "node:assert/strict";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");
const appFactory = await import("../../apps/platform-api/src/app-factory.ts");
const { resolvePreviewProxyDecision, renderPreviewUnavailableHtml, wantsPreviewJson } = appFactory;

const CREATOR = { "x-mock-user-email": "creator@company.com" };

test("preview decision: 401 unauth, 404 unknown slug, upstream for member", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser(CREATOR);
  const projectId = services.projects.listProjects(creator)[0].id;
  await services.workspaceOrchestrator.provisionWorkspace({ projectId, slug: "leave-tracker" });
  const key = projectId.replaceAll("_", "-");

  assert.deepEqual(await resolvePreviewProxyDecision(services, {}, key), { status: 401 });
  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, "no-such-key"), {
    status: 404
  });
  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, key), {
    upstream: `http://evcp-ws-${key}:3000`
  });
});

test("preview proxy authorizes physical runtime keys through their owning project", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser(CREATOR);
  const projectId = services.projects.listProjects(creator)[0].id;
  const warmRecord = {
    projectId,
    resourceKey: "warm-resource-1",
    state: "running"
  };
  services.workspaceOrchestrator = {
    findWorkspaceByResourceKey: (key) => (key === "warm-resource-1" ? warmRecord : null),
    findWorkspaceByPreviewKey: (key) => (key === "warm-resource-1" ? warmRecord : null),
    async resolvePreviewLocation() {
      return {
        containerName: "evcp-ws-warm-resource-1",
        previewKey: "warm-resource-1",
        previewBase: "/preview/warm-resource-1"
      };
    },
    getWorkspace: () => null,
    async wakeWorkspace() {},
    markActivity() {}
  };

  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, "warm-resource-1"), {
    upstream: "http://evcp-ws-warm-resource-1:3000"
  });
  assert.deepEqual(
    await resolvePreviewProxyDecision(
      services,
      { "x-mock-user-email": "user@company.com" },
      "warm-resource-1"
    ),
    { status: 403 }
  );
  assert.deepEqual(await resolvePreviewProxyDecision(services, CREATOR, "missing-resource"), {
    status: 404
  });
});

test("preview fallback renders a browser-friendly loading page instead of raw JSON", () => {
  assert.equal(wantsPreviewJson({ accept: "application/json" }), true);
  assert.equal(
    wantsPreviewJson({ accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }),
    false
  );

  const html = renderPreviewUnavailableHtml({ status: 503 });
  assert.match(html, /Starting workspace preview/);
  assert.match(html, /refresh/);
  assert.doesNotMatch(html, /preview_upstream_unreachable/);
});

test("legacy physical preview requests forward through the attached logical base", () => {
  assert.equal(
    appFactory.rewritePreviewForwardPath(
      "/preview/warm-resource-1/api/health?probe=1",
      "warm-resource-1",
      "/preview/prj-alpha"
    ),
    "/preview/prj-alpha/api/health?probe=1"
  );
});
