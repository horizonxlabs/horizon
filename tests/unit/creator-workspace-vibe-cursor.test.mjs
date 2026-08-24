import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
globalThis.window ??= {
  location: { pathname: "/creator/projects/project-1", href: "http://localhost/creator/projects/project-1" },
  addEventListener() {}, removeEventListener() {}
};
globalThis.document ??= {
  getElementById: () => null, createElement: () => ({ style: {} }),
  addEventListener() {}, removeEventListener() {}
};

const { WorkspacePage } = await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");

function renderCursor(messages, isVibing) {
  const app = {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined, isVibing,
    vibeStatus: isVibing ? "Working" : "Completed", vibeTab: "preview",
    setVibeTab() {}, setVibePreviewKey() {}, vibeMessages: messages,
    promptDraft: "", setPromptDraft() {}, cancelVibe() {}, handleVibeChat() {},
    approveAndImplement() {}, vibePreviewKey: 0, projectFiles: [], selectedAttachmentIds: [],
    isUploadingProjectFile: false, projectFileMessage: "", toggleProjectFileAttachment() {},
    handleUploadProjectFiles() {}, hasPreview: false, promptQueue: [], removeQueuedPrompt() {},
    bugReports: [], addBugReport() {}, dismissBugReport() {}, reloadChatHistory() {}
  };
  return renderToStaticMarkup(React.createElement(WorkspacePage, { app }));
}

test("the streaming cursor follows (message.text || !message.reasoning) only on the active assistant turn", () => {
  const pastActionOnly = {
    id: "a-past", role: "assistant", text: "",
    actions: [{ id: "past-action", type: "edit", label: "old.tsx", status: "done" }]
  };
  const activeText = { id: "a-live", role: "assistant", text: "Building now", actions: [] };
  assert.equal((renderCursor([pastActionOnly, activeText], true).match(/vibe-cursor-blink/g) ?? []).length, 1);

  const activeActionOnly = {
    id: "a-action", role: "assistant", text: "",
    actions: [{ id: "live-action", type: "edit", label: "new.tsx", status: "running" }]
  };
  assert.equal((renderCursor([activeActionOnly], true).match(/vibe-cursor-blink/g) ?? []).length, 1);

  const activeReasoningOnly = {
    id: "a-reasoning", role: "assistant", text: "", reasoning: "Inspecting", actions: []
  };
  assert.doesNotMatch(renderCursor([activeReasoningOnly], true), /vibe-cursor-blink/);
});

test("a completed assistant turn never renders the streaming cursor", () => {
  const completed = { id: "a-done", role: "assistant", text: "Completed", actions: [] };
  assert.doesNotMatch(renderCursor([completed], false), /vibe-cursor-blink/);
});
