import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= {
  location: { pathname: "/creator/projects/prj_alpha", href: "http://localhost/creator/projects/prj_alpha" },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window.localStorage ??= storage;
globalThis.window.setInterval ??= globalThis.setInterval;
globalThis.window.clearInterval ??= globalThis.clearInterval;
globalThis.document ??= {
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  addEventListener() {},
  removeEventListener() {}
};

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { WorkspacePage } =
  await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");

function app(overrides = {}) {
  return {
    selectedProject: { id: "prj_alpha", name: "Alpha", appType: "Internal app" },
    currentPrdVersion: undefined,
    isVibing: false,
    vibeStatus: "",
    vibeTab: "preview",
    setVibeTab() {},
    setVibePreviewKey() {},
    vibeMessages: [],
    promptDraft: "",
    setPromptDraft() {},
    cancelVibe() {},
    handleVibeChat() {},
    approveAndImplement() {},
    vibePreviewKey: 0,
    projectFiles: [],
    selectedAttachmentIds: [],
    isUploadingProjectFile: false,
    projectFileMessage: "",
    toggleProjectFileAttachment() {},
    handleUploadProjectFiles() {},
    hasPreview: false,
    promptQueue: [],
    removeQueuedPrompt() {},
    bugReports: [],
    addBugReport() {},
    dismissBugReport() {},
    reloadChatHistory() {},
    ...overrides
  };
}

test("Workspace renders its iframe with the server-authorized physical preview key", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ ok: true, data: { authorized: true, previewKey: "warm-resource-1" } }),
      { status: 200 }
    );
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(WorkspacePage, { app: app() }));
      await Promise.resolve();
    });

    assert.equal(renderer.root.findByType("iframe").props.src, "/preview/warm-resource-1");
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = previousFetch;
  }
});

test("Workspace retries preview authorization once when provisioning finishes", async () => {
  const previousFetch = globalThis.fetch;
  let authorizations = 0;
  globalThis.fetch = async () => {
    authorizations += 1;
    return authorizations === 1
      ? new Response(JSON.stringify({ ok: false, error: { code: "FORBIDDEN" } }), { status: 403 })
      : new Response(
          JSON.stringify({ ok: true, data: { authorized: true, previewKey: "warm-resource-1" } }),
          { status: 200 }
        );
  };
  let renderer;
  try {
    function Harness() {
      const [isEnteringWorkspace, setIsEnteringWorkspace] = React.useState(true);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(WorkspacePage, { app: app({ isEnteringWorkspace }) }),
        React.createElement(
          "button",
          { "aria-label": "complete provisioning", onClick: () => setIsEnteringWorkspace(false) },
          "ready"
        )
      );
    }
    await act(async () => {
      renderer = create(React.createElement(Harness));
      await Promise.resolve();
    });
    assert.equal(authorizations, 1);
    assert.equal(renderer.root.findAllByType("iframe").length, 0);

    await act(async () => {
      renderer.root.findByProps({ "aria-label": "complete provisioning" }).props.onClick();
      await Promise.resolve();
    });

    assert.equal(authorizations, 2);
    assert.equal(renderer.root.findByType("iframe").props.src, "/preview/warm-resource-1");
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = previousFetch;
  }
});
