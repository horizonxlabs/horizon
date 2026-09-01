import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {
  location: { port: "9800" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
};

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { useProjectFiles } =
  await import("../../apps/creator-web/src/features/workspace/use-project-files.ts");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function success(data) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
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

test("a project A upload cannot update messages or clear project B upload progress", async () => {
  const initA = deferred();
  const initB = deferred();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/files") && (!init.method || init.method === "GET")) return success([]);
    if (url.endsWith("/A/files/init")) return initA.promise;
    if (url.endsWith("/B/files/init")) return initB.promise;
    if (url.endsWith("/A/files/upload-A/complete")) return success({ file: upload("A") });
    if (url.endsWith("/B/files/upload-B/complete")) return success({ file: upload("B") });
    throw new Error(`Unexpected request: ${url}`);
  };
  const file = (name) => ({
    name,
    type: "text/plain",
    size: 1,
    arrayBuffer: async () => new TextEncoder().encode(name).buffer,
    text: async () => name
  });
  let latest;
  function Probe({ projectId }) {
    latest = useProjectFiles(projectId);
    return React.createElement(
      "output",
      null,
      `${latest.projectFileMessage}:${latest.isUploadingProjectFile}`
    );
  }
  let renderer;
  let uploadA;
  await act(async () => {
    renderer = create(React.createElement(Probe, { projectId: "A" }));
    await tick();
  });
  await act(async () => {
    uploadA = latest.handleUploadProjectFiles([file("A.txt")]);
    await Promise.resolve();
  });
  let uploadB;
  await act(async () => {
    renderer.update(React.createElement(Probe, { projectId: "B" }));
    await tick();
  });
  await act(async () => {
    uploadB = latest.handleUploadProjectFiles([file("B.txt")]);
    await Promise.resolve();
  });
  assert.equal(latest.isUploadingProjectFile, true);
  await act(async () => {
    initA.resolve(success({ uploadId: "upload-A", uploadUrl: "/internal/upload-A" }));
    await uploadA;
  });
  assert.equal(latest.isUploadingProjectFile, true, "project A finalizer must not stop project B");
  assert.equal(latest.projectFileMessage, "Uploading project files...");
  assert.deepEqual(latest.projectFiles, []);

  await act(async () => {
    initB.resolve(success({ uploadId: "upload-B", uploadUrl: "/internal/upload-B" }));
    await uploadB;
  });
  assert.equal(latest.isUploadingProjectFile, false);
  assert.equal(latest.projectFileMessage, "Project files ready for AI context.");
  assert.deepEqual(
    latest.projectFiles.map((item) => item.projectId),
    ["B"]
  );
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
});
