import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
globalThis.window ??= {
  location: {
    pathname: "/creator/projects/project-1",
    href: "http://localhost/creator/projects/project-1"
  },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document ??= {
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  addEventListener() {},
  removeEventListener() {}
};
globalThis.fetch ??= async () => ({
  ok: false,
  status: 401,
  json: async () => ({}),
  text: async () => ""
});

const { WorkspacePage } =
  await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");

function failedWorkspaceApp() {
  return {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined,
    isVibing: false,
    vibeStatus: "Request failed",
    vibeTechnicalDetails: "The workspace command exited with status 1.",
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
    reloadChatHistory() {}
  };
}

test("Workspace keeps the composer docked below the scrollable thread after a request failure", async () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspacePage, { app: failedWorkspaceApp() })
  );
  assert.match(
    html,
    /vibe-live-chat-panel has-workspace-failure[\s\S]*vibe-live-thread[\s\S]*vibe-live-composer-wrap/
  );

  const css = await readFile("packages/ui/styles.css", "utf8");
  assert.match(css, /\.vibe-live-chat-panel\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/);
  assert.match(css, /\.vibe-live-thread\s*\{[\s\S]*?flex:\s*1;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.vibe-live-composer-wrap\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?\}/);
  assert.doesNotMatch(css, /\.vibe-live-chat-panel\.has-workspace-failure \.vibe-live-thread\s*\{/);
});
