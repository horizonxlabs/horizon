import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

const { useCreatorPrd } = await import("../../apps/creator-web/src/app/use-creator-prd.ts");
const { createCreatorProjectRuntimeGuard, loadCreatorProjectRuntime } =
  await import("../../apps/creator-web/src/app/creator-project-runtime.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const project = (id) => ({
  id,
  name: `Project ${id}`,
  appType: "Workflow App",
  status: "draft",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "pending",
  tokenUsedThisMonth: 0,
  createdAt: "2026-08-25T00:00:00.000Z"
});

const prd = (projectId) => ({
  id: `prd-${projectId}`,
  projectId,
  version: projectId,
  status: "draft",
  sections: [],
  changeSummary: `PRD ${projectId}`
});

let latestPrd;
function PrdProbe({ selectedProject, loadPrd }) {
  latestPrd = useCreatorPrd(selectedProject, { loadPrdState: loadPrd });
  return React.createElement(
    "output",
    null,
    latestPrd.currentPrdVersion?.projectId ?? latestPrd.prdMessage
  );
}

test("PRD refresh keeps project B when project A resolves last", async () => {
  const projectA = deferred();
  const projectB = deferred();
  const loadPrd = (projectId) => (projectId === "A" ? projectA.promise : projectB.promise);
  const runtimeGuard = createCreatorProjectRuntimeGuard();
  let renderer;

  await act(async () => {
    renderer = create(React.createElement(PrdProbe, { selectedProject: project("A"), loadPrd }));
  });
  let refreshA;
  let refreshB;
  await act(async () => {
    const requestA = runtimeGuard.begin("A");
    refreshA = latestPrd.refreshPrdState("A", requestA);
    renderer.update(React.createElement(PrdProbe, { selectedProject: project("B"), loadPrd }));
    const requestB = runtimeGuard.begin("B");
    refreshB = latestPrd.refreshPrdState("B", requestB);
    await Promise.resolve();
  });
  await act(async () => {
    projectB.resolve({ current: prd("B"), versions: [prd("B")] });
    await refreshB;
  });
  assert.match(JSON.stringify(renderer.toJSON()), /B/);

  await act(async () => {
    projectA.resolve({ current: prd("A"), versions: [prd("A")] });
    await refreshA;
  });
  assert.match(JSON.stringify(renderer.toJSON()), /B/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /PRD A/);
  await act(async () => renderer.unmount());
});

test("project runtime ignores stale workspace state, message, and loading finalizer", async () => {
  const runtimeGuard = createCreatorProjectRuntimeGuard();
  const workspaceA = deferred();
  const workspaceB = deferred();
  const snapshots = [];
  const messages = [];
  const loading = [];
  const deps = {
    refreshPrdState: async () => undefined,
    ensureWorkspace: async () => undefined,
    loadWorkspaceState: (projectId) =>
      projectId === "A" ? workspaceA.promise : workspaceB.promise,
    refreshPublishState: async () => undefined,
    onWorkspaceSnapshot: (snapshot) => snapshots.push(snapshot.projectId),
    onWorkspaceMessage: (message) => messages.push(message),
    onWorkspaceUnavailable: () => messages.push("unavailable"),
    onSettled: () => loading.push(false)
  };

  const requestA = runtimeGuard.begin("A");
  const runA = loadCreatorProjectRuntime({
    request: requestA,
    enteringWorkspace: true,
    ...deps
  });
  await Promise.resolve();
  const requestB = runtimeGuard.begin("B");
  const runB = loadCreatorProjectRuntime({
    request: requestB,
    enteringWorkspace: true,
    ...deps
  });
  await Promise.resolve();

  workspaceA.resolve({ projectId: "A" });
  await runA;
  assert.deepEqual(snapshots, []);
  assert.deepEqual(messages, []);
  assert.deepEqual(loading, [], "project A must not clear project B's loading state");

  workspaceB.resolve({ projectId: "B" });
  await runB;
  assert.deepEqual(snapshots, ["B"]);
  assert.deepEqual(messages, ["Workspace snapshot loaded from Platform API."]);
  assert.deepEqual(loading, [false]);
  assert.equal(requestA.signal.aborted, true);
});

test("project runtime ignores a stale workspace failure", async () => {
  const runtimeGuard = createCreatorProjectRuntimeGuard();
  const workspaceA = deferred();
  const workspaceStarted = deferred();
  const messages = [];
  const requestA = runtimeGuard.begin("A");
  const runA = loadCreatorProjectRuntime({
    request: requestA,
    enteringWorkspace: false,
    refreshPrdState: async () => undefined,
    ensureWorkspace: async () => undefined,
    loadWorkspaceState: () => {
      workspaceStarted.resolve();
      return workspaceA.promise;
    },
    refreshPublishState: async () => undefined,
    onWorkspaceSnapshot: () => assert.fail("stale snapshot must not commit"),
    onWorkspaceMessage: (message) => messages.push(message),
    onWorkspaceUnavailable: () => messages.push("unavailable"),
    onSettled: () => messages.push("settled")
  });
  await workspaceStarted.promise;
  runtimeGuard.begin("B");
  workspaceA.reject(new Error("project A workspace offline"));
  await runA;
  assert.deepEqual(messages, []);
});

test.after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
