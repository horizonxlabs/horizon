import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React, { useState } from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= {
  location: { pathname: "/creator/projects/project-1", href: "http://localhost/creator/projects/project-1" },
  localStorage: storage, addEventListener() {}, removeEventListener() {}
};
globalThis.window.localStorage ??= storage;
globalThis.document ??= {
  getElementById: () => null, createElement: () => ({ style: {} }),
  addEventListener() {}, removeEventListener() {}
};
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "" });

const requireFromStore = createRequire(new URL("../../apps/app-store-pwa/package.json", import.meta.url));
const { act, create } = requireFromStore("react-test-renderer");
const { WorkspacePage } = await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");

function appFor(vibeTab, setVibeTab) {
  return {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined, isVibing: false, vibeStatus: "Completed",
    vibeTab, setVibeTab, setVibePreviewKey() {}, vibeMessages: [], promptDraft: "",
    setPromptDraft() {}, cancelVibe() {}, handleVibeChat() {}, approveAndImplement() {},
    vibePreviewKey: 0, projectFiles: [], selectedAttachmentIds: [], isUploadingProjectFile: false,
    projectFileMessage: "", toggleProjectFileAttachment() {}, handleUploadProjectFiles() {},
    hasPreview: false, promptQueue: [], removeQueuedPrompt() {}, bugReports: [], addBugReport() {},
    dismissBugReport() {}, reloadChatHistory() {}
  };
}

test("mobile selection and desktop tabs keep the selected Workspace panel synchronized", async () => {
  function Harness() {
    const [vibeTab, setVibeTab] = useState("preview");
    return React.createElement(WorkspacePage, { app: appFor(vibeTab, setVibeTab) });
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const workspaceBody = () => renderer.root.findByProps({ className: "vibe-live-body" });
  const switcher = renderer.root.findByProps({ "aria-label": "Workspace panels" });
  const codeButton = switcher.findAllByType("button").find((button) => button.children.includes("Code"));
  await act(async () => codeButton.props.onClick());
  assert.equal(workspaceBody().props["data-workspace-view"], "code");
  assert.equal(codeButton.props["aria-pressed"], true);

  const databaseTab = renderer.root.findAll((node) => node.props.role === "tab").find((tab) => tab.children.includes("Database"));
  await act(async () => databaseTab.props.onClick());
  assert.equal(workspaceBody().props["data-workspace-view"], "database");
});
