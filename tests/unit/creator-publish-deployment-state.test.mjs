import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { usePublishAccess } =
  await import("../../apps/creator-web/src/features/publish/use-publish-access.ts");

const selectedProject = {
  id: "project-1",
  name: "Project One",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "1.0",
  frontendVersion: "fe-1",
  tokenUsedThisMonth: 0
};

let latest;
function PublishProbe({ loadPublishState }) {
  latest = usePublishAccess({
    selectedProject,
    clientFactory: () => ({}),
    loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
    loadPublishState
  });
  return React.createElement("output", null, latest.visibleDeployment?.id ?? "none");
}

test("publish state reload restores the latest healthy persisted deployment", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishProbe, {
        loadPublishState: async () => ({
          review: { manifest: { manifestVersion: "4" }, checklist: [], ready: true },
          registry: [{ projectId: "project-1", manifestVersion: "4", status: "published" }],
          deployments: [
            {
              id: "failed-newer",
              environment: "production",
              healthStatus: "failed",
              createdAt: "2026-08-13T12:00:00.000Z"
            },
            {
              id: "healthy-production",
              environment: "production",
              healthStatus: "healthy",
              createdAt: "2026-08-13T11:00:00.000Z"
            }
          ]
        })
      })
    );
  });

  await act(async () => {
    await latest.refreshCreatorPublishState("project-1");
  });

  assert.deepEqual(latest.visibleDeployment, {
    id: "healthy-production",
    status: "healthy",
    environment: "production",
    manifestVersion: "4"
  });
  assert.match(JSON.stringify(renderer.toJSON()), /healthy-production/);
  await act(async () => renderer.unmount());
});

test.after(() => {
  globalThis.React = originalReact;
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
