import assert from "node:assert/strict";
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
const { buildWorkspaceRetryPrompt } =
  await import("../../apps/creator-web/src/features/workspace/workspace-failure.ts");

test("Workspace turns a persisted Vault failure into an actionable recovery state", () => {
  const app = {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    isVibing: false,
    vibeStatus: "Failed",
    vibeTab: "preview",
    setVibeTab() {},
    setVibePreviewKey() {},
    vibeMessages: [
      { id: "u-1", role: "user", text: "Build the first preview", actions: [] },
      {
        id: "a-1",
        role: "assistant",
        text: "\n\n⚠️ Vault secret operation failed (403)",
        actions: [],
        parts: [
          {
            id: "error-1",
            type: "error",
            sequence: 0,
            message: "Vault secret operation failed (403)"
          }
        ]
      }
    ],
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
  const html = renderToStaticMarkup(React.createElement(WorkspacePage, { app }));

  assert.match(html, /vibe-live-status is-failed/);
  assert.doesNotMatch(html, /vibe-live-status is-ready[^>]*>[\s\S]*Failed/);
  assert.match(html, /Secure credentials are unavailable/);
  assert.match(html, /couldn&#x27;t access this project&#x27;s secure credentials/);
  assert.match(html, />Retry access<\/button>/);
  assert.match(html, /<summary>Technical details<\/summary>/);
  assert.equal((html.match(/Vault secret operation failed \(403\)/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Suggested next/);
  assert.match(html, /vibe-live-chat-panel has-workspace-failure/);
  assert.match(html, /vibe-workspace-recovery-card/);
  assert.match(html, /vibe-workspace-recovery-actions/);
  assert.doesNotMatch(html, /creator-state-error/);
});

test("Workspace retry prompt keeps intent and redacts credentials from the latest error", () => {
  const prompt = buildWorkspaceRetryPrompt({
    retryPrompt: "Connect the app to Gemini",
    technicalDetails:
      "Provider failed: api_key=test-provider-key token=secret-token password=hunter2"
  });

  assert.match(prompt, /Original request:\nConnect the app to Gemini/);
  assert.match(prompt, /Latest error:\nProvider failed/);
  assert.doesNotMatch(prompt, /test-provider-key|secret-token|hunter2/);
  assert.equal((prompt.match(/\[REDACTED\]/g) ?? []).length, 3);
});
