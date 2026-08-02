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

const { useFrontendVersions } =
  await import("../../apps/creator-web/src/features/versions/use-frontend-versions.ts");
const { useDeployments } =
  await import("../../apps/creator-web/src/features/deployments/use-deployments.ts");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const project = (id) => ({
  id,
  name: `Project ${id}`,
  status: "active",
  ownerUserId: "user-1",
  appType: "Workflow App",
  businessProblem: "Workflow",
  targetDepartment: "Operations",
  intendedUsers: ["employee"],
  dataSensitivity: "internal",
  createdAt: "2026-07-29T00:00:00.000Z"
});

const checkpoint = (projectId, version = `fe-${projectId}`) => ({
  id: `checkpoint-${projectId}`,
  projectId,
  version,
  sourcePreviewVersion: `preview-${projectId}`,
  status: "current",
  checksum: `sha256:${projectId}`,
  fileManifest: ["src/App.tsx"],
  routeSnapshot: ["/"],
  changeSummary: `Version ${projectId}`,
  changedAreas: ["UI"],
  createdByUserId: "user-1",
  createdAt: "2026-07-29T00:00:00.000Z"
});

const timeline = (projectId) => ({
  project: project(projectId),
  activeCheckpoint: checkpoint(projectId),
  checkpoints: [checkpoint(projectId)]
});

const deployment = (projectId, suffix = projectId) => ({
  id: `deployment-${suffix}`,
  projectId,
  slug: `app-${projectId}`,
  environment: "production",
  commitSha: `commit-${suffix}`,
  imageTag: `app:${suffix}`,
  containerId: `container-${suffix}`,
  publishedByUserId: "user-1",
  healthStatus: "healthy",
  createdAt: "2026-07-29T00:00:00.000Z"
});

let latestVersions;
function VersionsProbe({ projectId, client, renderTrace }) {
  latestVersions = useFrontendVersions(projectId, client);
  renderTrace?.push(`${projectId}:${latestVersions.timeline?.project.id ?? latestVersions.status}`);
  return React.createElement(
    "output",
    null,
    latestVersions.timeline?.project.id ?? latestVersions.message
  );
}

let latestDeployments;
function DeploymentsProbe({ projectId, client, renderTrace }) {
  latestDeployments = useDeployments(projectId, client);
  renderTrace?.push(
    `${projectId}:${latestDeployments.deployments[0]?.projectId ?? latestDeployments.status}`
  );
  return React.createElement(
    "output",
    null,
    latestDeployments.deployments[0]?.commitSha ?? latestDeployments.message
  );
}

function output(renderer) {
  return JSON.stringify(renderer.toJSON());
}

test("frontend versions ignores a slow previous project after navigation", async () => {
  const projectA = deferred();
  const projectB = deferred();
  const client = {
    getFrontendCheckpoints: (projectId) => (projectId === "A" ? projectA.promise : projectB.promise)
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(VersionsProbe, { projectId: "A", client }));
  });
  await act(async () => {
    renderer.update(React.createElement(VersionsProbe, { projectId: "B", client }));
  });
  await act(async () => {
    projectB.resolve(timeline("B"));
    await Promise.resolve();
  });
  assert.match(output(renderer), /B/);
  await act(async () => {
    projectA.resolve(timeline("A"));
    await Promise.resolve();
  });
  assert.match(output(renderer), /B/);
  assert.doesNotMatch(output(renderer), /Project A|fe-A/);
  await act(async () => renderer.unmount());
});

test("deployments keeps the newest manual refresh result", async () => {
  const initial = deferred();
  const olderRefresh = deferred();
  const newerRefresh = deferred();
  const queue = [initial, olderRefresh, newerRefresh];
  const client = {
    listDeployments: () => queue.shift().promise
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(DeploymentsProbe, { projectId: "A", client }));
  });
  await act(async () => {
    initial.resolve([deployment("A", "initial")]);
    await Promise.resolve();
  });
  let firstRefresh;
  let secondRefresh;
  await act(async () => {
    firstRefresh = latestDeployments.refresh();
    secondRefresh = latestDeployments.refresh();
    await Promise.resolve();
  });
  await act(async () => {
    newerRefresh.resolve([deployment("A", "newest")]);
    await secondRefresh;
  });
  assert.match(output(renderer), /commit-newest/);
  await act(async () => {
    olderRefresh.resolve([deployment("A", "older")]);
    await firstRefresh;
  });
  assert.match(output(renderer), /commit-newest/);
  assert.doesNotMatch(output(renderer), /commit-older/);
  await act(async () => renderer.unmount());
});

test("frontend restore from an old project cannot replace the current project timeline", async () => {
  const restoreMutation = deferred();
  const restoreRefresh = deferred();
  const projectB = deferred();
  let projectALoads = 0;
  const restoredFrom = { ...checkpoint("A"), id: "checkpoint-A-old", version: "fe-A-old" };
  const client = {
    getFrontendCheckpoints(projectId) {
      if (projectId === "B") return projectB.promise;
      projectALoads += 1;
      return projectALoads === 1 ? Promise.resolve(timeline("A")) : restoreRefresh.promise;
    },
    restoreFrontendCheckpoint: () => restoreMutation.promise
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(VersionsProbe, { projectId: "A", client }));
    await Promise.resolve();
  });
  let restoreRun;
  await act(async () => {
    restoreRun = latestVersions.restoreCheckpoint("checkpoint-A-old");
    await Promise.resolve();
  });
  await act(async () => {
    renderer.update(React.createElement(VersionsProbe, { projectId: "B", client }));
    projectB.resolve(timeline("B"));
    await Promise.resolve();
  });
  await act(async () => {
    restoreMutation.resolve({
      checkpoint: checkpoint("A"),
      restoredFrom,
      boundary: { frontendChanged: true, unchanged: ["backend", "database"] },
      auditEventId: "audit-A"
    });
    await Promise.resolve();
    restoreRefresh.resolve(timeline("A"));
    await restoreRun;
  });
  assert.match(output(renderer), /B/);
  assert.doesNotMatch(output(renderer), /fe-A-old|Restored frontend/);
  await act(async () => renderer.unmount());
});

test("frontend versions never exposes project A state during the first project B render", async () => {
  const projectB = deferred();
  const renderTrace = [];
  const client = {
    getFrontendCheckpoints: (projectId) =>
      projectId === "A" ? Promise.resolve(timeline("A")) : projectB.promise
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(VersionsProbe, { projectId: "A", client, renderTrace }));
    await Promise.resolve();
  });
  assert.match(output(renderer), /A/);
  renderTrace.length = 0;

  await act(async () => {
    renderer.update(React.createElement(VersionsProbe, { projectId: "B", client, renderTrace }));
  });
  assert.doesNotMatch(renderTrace.join("|"), /B:A/);
  assert.match(output(renderer), /Loading frontend checkpoints/);

  await act(async () => {
    projectB.resolve(timeline("B"));
    await Promise.resolve();
  });
  await act(async () => renderer.unmount());
});

test("deployments never exposes project A state during the first project B render", async () => {
  const projectB = deferred();
  const renderTrace = [];
  const client = {
    listDeployments: (projectId) =>
      projectId === "A" ? Promise.resolve([deployment("A")]) : projectB.promise
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(DeploymentsProbe, { projectId: "A", client, renderTrace })
    );
    await Promise.resolve();
  });
  assert.match(output(renderer), /commit-A/);
  renderTrace.length = 0;

  await act(async () => {
    renderer.update(React.createElement(DeploymentsProbe, { projectId: "B", client, renderTrace }));
  });
  assert.doesNotMatch(renderTrace.join("|"), /B:A/);
  assert.match(output(renderer), /Loading deployments/);

  await act(async () => {
    projectB.resolve([deployment("B")]);
    await Promise.resolve();
  });
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
