import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const windowListeners = new Map();

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const storage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  location: {
    pathname: "/creator/projects/A",
    search: "",
    hash: "",
    href: "http://localhost:9800/creator/projects/A",
    port: "9800",
    assign() {}
  },
  history: {
    pushState(_state, _unused, path) {
      window.location.pathname = String(path);
    },
    replaceState() {}
  },
  localStorage: storage,
  addEventListener(type, listener) {
    const listeners = windowListeners.get(type) ?? new Set();
    listeners.add(listener);
    windowListeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    windowListeners.get(type)?.delete(listener);
  },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) ?? []) listener(event);
    return true;
  },
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = {
  title: "Creator",
  addEventListener() {},
  removeEventListener() {},
  querySelector() {
    return null;
  },
  getElementById() {
    return null;
  }
};

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { useCreatorPrd } = await import("../../apps/creator-web/src/app/use-creator-prd.ts");
const { useProjectFiles } =
  await import("../../apps/creator-web/src/features/workspace/use-project-files.ts");
const { useCreatorApp } = await import("../../apps/creator-web/src/app/use-creator-app.tsx");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function success(data) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function project(id) {
  return {
    id,
    name: `Project ${id}`,
    appType: "Workflow App",
    status: "draft",
    owner: "Creator",
    prdVersion: "0.1",
    frontendVersion: "pending",
    tokenUsedThisMonth: 0,
    createdAt: `2026-08-${id === "A" ? "24" : "25"}T00:00:00.000Z`
  };
}

function prd(projectId, version) {
  return {
    id: `prd-${projectId}-${version}`,
    projectId,
    version,
    status: "draft",
    sections: [],
    changeSummary: `PRD ${projectId}`
  };
}

function upload(projectId) {
  return {
    id: `file-${projectId}`,
    projectId,
    fileName: `${projectId}.txt`,
    mimeType: "text/plain",
    sizeBytes: 1,
    sha256: projectId,
    includeByDefault: true,
    scanStatus: "clean",
    createdAt: "2026-08-25T00:00:00.000Z"
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("manual PRD generation from project A cannot replace or finalize project B", async () => {
  const generateA = deferred();
  const generateB = deferred();
  globalThis.fetch = (input, init = {}) => {
    const match = String(input).match(/\/projects\/([^/]+)\/prd\/generate$/);
    assert.equal(init.method, "POST");
    return match?.[1] === "A" ? generateA.promise : generateB.promise;
  };
  let latest;
  function Probe({ selectedProject }) {
    latest = useCreatorPrd(selectedProject);
    return React.createElement(
      "output",
      null,
      latest.currentPrdVersion?.projectId ?? latest.prdMessage
    );
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { selectedProject: project("A") }));
  });
  let runA;
  await act(async () => {
    runA = latest.handleGeneratePrdDraft();
    renderer.update(React.createElement(Probe, { selectedProject: project("B") }));
  });
  let runB;
  await act(async () => {
    runB = latest.handleGeneratePrdDraft();
  });
  assert.equal(latest.isGeneratingPrdDraft, true);

  await act(async () => {
    generateA.resolve(success(prd("A", "1.0")));
    await runA;
  });
  const generatingAfterA = latest.isGeneratingPrdDraft;
  const outputAfterA = JSON.stringify(renderer.toJSON());

  await act(async () => {
    generateB.resolve(success(prd("B", "2.0")));
    await runB;
  });
  assert.equal(latest.isGeneratingPrdDraft, false);
  assert.equal(latest.currentPrdVersion?.projectId, "B");
  await act(async () => renderer.unmount());
  assert.equal(generatingAfterA, true, "project A finalizer must not stop project B");
  assert.doesNotMatch(outputAfterA, /PRD A|projectId":"A/);
});

test("manual PRD confirmation from project A cannot replace project B", async () => {
  const confirmA = deferred();
  globalThis.fetch = (input, init = {}) => {
    assert.match(String(input), /\/projects\/A\/prd\/baseline$/);
    assert.equal(init.method, "POST");
    return confirmA.promise;
  };
  let latest;
  function Probe({ selectedProject }) {
    latest = useCreatorPrd(selectedProject);
    return React.createElement(
      "output",
      null,
      latest.currentPrdVersion?.projectId ?? latest.prdMessage
    );
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { selectedProject: project("A") }));
  });
  await act(async () => {
    latest.setCurrentPrdVersion(prd("A", "1.0"));
  });
  let confirmation;
  await act(async () => {
    confirmation = latest.handleConfirmPrdBaseline();
    renderer.update(React.createElement(Probe, { selectedProject: project("B") }));
    latest.setCurrentPrdVersion(prd("B", "2.0"));
  });
  await act(async () => {
    confirmA.resolve(success({ ...prd("A", "1.0"), status: "baseline" }));
    await confirmation;
  });
  assert.equal(latest.currentPrdVersion?.projectId, "B");
  assert.doesNotMatch(latest.prdMessage, /Baseline v1\.0 confirmed/);
  await act(async () => renderer.unmount());
});

test("switching from Workspace to another page clears the loading overlay immediately", async () => {
  const workspaceA = deferred();
  const accessB = deferred();
  const projects = [project("A"), project("B")].map((item) => ({
    ...item,
    activeFrontendCheckpointId: null
  }));
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return success({ user: { id: "creator", name: "Creator" } });
    if (url.endsWith("/projects")) return success(projects);
    if (url.includes("/creator/projects/") && url.endsWith("/files")) return success([]);
    if (url.endsWith("/prd/versions")) return success([]);
    if (url.endsWith("/workspace/container") && (!init.method || init.method === "GET")) {
      return workspaceA.promise;
    }
    if (url.endsWith("/workspace")) {
      return success({
        projectId: url.includes("/B/") ? "B" : "A",
        tasks: [],
        usage: [],
        tokenBudget: { remainingToday: 0, remainingMonth: 0, requestEstimate: 0 }
      });
    }
    if (url.endsWith("/app/users")) return accessB.promise;
    return success({ projectId: url.includes("/B/") ? "B" : "A" });
  };
  let latest;
  function Probe() {
    latest = useCreatorApp({});
    return React.createElement("output", null, String(latest.isEnteringWorkspace));
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe));
    await tick();
    await tick();
  });
  assert.equal(latest.isEnteringWorkspace, true);
  await act(async () => {
    void latest.handleSelectProject(project("B"), "users");
    await Promise.resolve();
  });
  assert.equal(latest.isEnteringWorkspace, false);
  await act(async () => renderer.unmount());
});

test("project files clear immediately on an A to B switch", async () => {
  const listA = deferred();
  const listB = deferred();
  globalThis.fetch = (input) =>
    String(input).includes("/A/files") ? listA.promise : listB.promise;
  let latest;
  function Probe({ projectId }) {
    latest = useProjectFiles(projectId);
    return React.createElement(
      "output",
      null,
      latest.projectFiles.map((file) => file.projectId).join(",")
    );
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { projectId: "A" }));
  });
  await act(async () => {
    listA.resolve(success([upload("A")]));
    await tick();
  });
  assert.deepEqual(
    latest.projectFiles.map((file) => file.projectId),
    ["A"]
  );

  await act(async () => {
    renderer.update(React.createElement(Probe, { projectId: "B" }));
  });
  assert.deepEqual(latest.projectFiles, [], "project A files must disappear on the B render");
  await act(async () => {
    listB.resolve(success([upload("B")]));
    await tick();
  });
  assert.deepEqual(
    latest.projectFiles.map((file) => file.projectId),
    ["B"]
  );
  await act(async () => renderer.unmount());
});

test("a late project A file list cannot replace project B files", async () => {
  const listA = deferred();
  const listB = deferred();
  globalThis.fetch = (input) =>
    String(input).includes("/A/files") ? listA.promise : listB.promise;
  let latest;
  function Probe({ projectId }) {
    latest = useProjectFiles(projectId);
    return React.createElement(
      "output",
      null,
      latest.projectFiles.map((file) => file.projectId).join(",")
    );
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Probe, { projectId: "A" }));
  });
  await act(async () => {
    renderer.update(React.createElement(Probe, { projectId: "B" }));
  });
  await act(async () => {
    listB.resolve(success([upload("B")]));
    await tick();
  });
  await act(async () => {
    listA.resolve(success([upload("A")]));
    await tick();
  });
  assert.deepEqual(
    latest.projectFiles.map((file) => file.projectId),
    ["B"]
  );
  assert.equal(latest.projectFileMessage, "Project files ready for AI context.");
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});
