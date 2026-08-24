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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const projectA = {
  id: "project-a",
  name: "Project A",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-a",
  tokenUsedThisMonth: 0
};

function accessSnapshot(project) {
  return {
    members: [],
    invitations: [],
    accessRequests: [],
    roles: [
      {
        id: `role-${project}`,
        key: "manager",
        name: `${project} Manager`,
        permissions: [`${project}.approve`],
        memberCount: 1
      }
    ]
  };
}

function publishState(project) {
  return {
    review: {
      checklist: [],
      manifest: { manifestVersion: `manifest-${project}` }
    },
    registry: [
      {
        id: `registry-${project}`,
        projectId: `project-${project.toLowerCase()}`,
        manifestVersion: `manifest-${project}`
      }
    ],
    deployments: [
      {
        id: `deployment-${project}`,
        projectId: `project-${project.toLowerCase()}`,
        environment: "app_store",
        healthStatus: "healthy",
        createdAt: `2026-08-${project === "A" ? "20" : "21"}T00:00:00.000Z`
      }
    ]
  };
}

let latest;
function AccessProbe({ client, loadAccessState, loadPublishState }) {
  latest = usePublishAccess({
    selectedProject: projectA,
    clientFactory: () => client,
    loadAccessState,
    loadPublishState
  });
  return React.createElement("output", null, latest.publishMessage);
}

function assertProjectBState() {
  assert.equal(latest.accessLoadState, "ready");
  assert.deepEqual(latest.visibleAppRoles, [
    {
      role: "B Manager",
      permissions: "B.approve",
      members: "1",
      status: "active"
    }
  ]);
  assert.equal(latest.publishReview.manifest.manifestVersion, "manifest-B");
  assert.equal(latest.publishResult, undefined);
  assert.deepEqual(
    latest.registryEntries.map((entry) => entry.id),
    ["registry-B"]
  );
  assert.deepEqual(
    latest.runtimeDeployments.map((deployment) => deployment.id),
    ["deployment-B"]
  );
  assert.equal(latest.publishMessage, "Access information and publish readiness are up to date.");
  assert.equal(latest.publishMessageTone, "success");
  assert.equal(latest.publishMessageTechnicalDetails, undefined);
}

test("Project A stale successes cannot overwrite Project B access, publish state, or publish result", async () => {
  const accessSuccessA = deferred();
  const publishStateA = deferred();
  const publishResultA = deferred();
  let projectAAccessCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          publishProject: async () => publishResultA.promise,
          listAppStoreRegistry: async () => publishState("A").registry,
          listDeployments: async () => publishState("A").deployments
        },
        loadAccessState: async (projectId) => {
          if (projectId !== "project-a") return accessSnapshot("B");
          projectAAccessCalls += 1;
          return projectAAccessCalls === 1 ? accessSnapshot("A") : accessSuccessA.promise;
        },
        loadPublishState: async (projectId) =>
          projectId === "project-a" ? publishStateA.promise : publishState("B")
      })
    );
  });

  let staleRefresh;
  let staleAccess;
  let stalePublish;
  await act(async () => {
    staleRefresh = latest.refreshCreatorPublishState("project-a");
    await Promise.resolve();
    staleAccess = latest.refreshCreatorAccessState("project-a");
    stalePublish = latest.handlePublishProject();
  });

  await act(async () => {
    latest.resetPublishAccess();
    await latest.refreshCreatorPublishState("project-b");
  });
  assertProjectBState();

  await act(async () => {
    accessSuccessA.resolve(accessSnapshot("A"));
    publishStateA.resolve(publishState("A"));
    publishResultA.resolve({
      registryEntry: publishState("A").registry[0],
      deployment: publishState("A").deployments[0],
      manifest: { manifestVersion: "manifest-A" }
    });
    await Promise.all([staleRefresh, staleAccess, stalePublish]);
  });

  assertProjectBState();
  await act(async () => renderer.unmount());
});

test("Project A stale failures cannot replace Project B ready state or feedback", async () => {
  const accessA = deferred();
  const publishResultA = deferred();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          publishProject: async () => publishResultA.promise
        },
        loadAccessState: async (projectId) =>
          projectId === "project-a" ? accessA.promise : accessSnapshot("B"),
        loadPublishState: async () => publishState("B")
      })
    );
  });

  let staleRefresh;
  let stalePublish;
  await act(async () => {
    staleRefresh = latest.refreshCreatorPublishState("project-a");
    stalePublish = latest.handlePublishProject();
    await Promise.resolve();
  });
  await act(async () => {
    latest.resetPublishAccess();
    await latest.refreshCreatorPublishState("project-b");
  });
  assertProjectBState();

  await act(async () => {
    accessA.reject(new Error("Project A access failed late"));
    publishResultA.reject(new Error("Project A publish failed late"));
    await Promise.allSettled([staleRefresh, stalePublish]);
  });

  assertProjectBState();
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
