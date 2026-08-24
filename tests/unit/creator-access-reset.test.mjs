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
  id: "project-a",
  name: "Project A",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-1",
  tokenUsedThisMonth: 0
};

let latest;
function AccessProbe() {
  latest = usePublishAccess({
    selectedProject,
    clientFactory: () => ({}),
    loadAccessState: async () => {
      throw new Error("project-a access offline");
    },
    loadPublishState: async () => ({ review: undefined, registry: [], deployments: [] })
  });
  return React.createElement("output", null, latest.publishMessage);
}

test("reset clears prior-project access feedback and restores a neutral loading state", async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AccessProbe));
  });
  await act(async () => {
    await assert.rejects(() => latest.refreshCreatorPublishState("project-a"), /access offline/);
  });
  assert.equal(latest.accessLoadState, "unavailable");
  assert.equal(latest.publishReadinessState, "unavailable");
  assert.equal(latest.publishMessageTone, "danger");
  assert.equal(latest.publishMessageTechnicalDetails, "project-a access offline");

  await act(async () => latest.resetPublishAccess());

  assert.equal(latest.appAccessSnapshot, undefined);
  assert.equal(latest.accessLoadState, "loading");
  assert.equal(latest.publishReadinessState, "loading");
  assert.equal(latest.publishMessage, "Loading access and publish information.");
  assert.equal(latest.publishMessageTone, "info");
  assert.equal(latest.publishMessageTechnicalDetails, undefined);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
