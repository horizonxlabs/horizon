import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
globalThis.fetch ??= async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "" });

const { WorkspacePage } = await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");
const { VibeActionSummary } = await import("../../apps/creator-web/src/features/workspace/VibeActionSummary.tsx");
const { VibeReasoning } = await import("../../apps/creator-web/src/features/workspace/VibeReasoning.tsx");
const { VibeQuestionBlock } = await import("../../apps/creator-web/src/features/workspace/VibeQuestionBlock.tsx");
const { PromptQueue } = await import("../../apps/creator-web/src/features/workspace/PromptQueue.tsx");
const { BugReportBox } = await import("../../apps/creator-web/src/features/workspace/BugReportBox.tsx");
const { VibeUserBubble } = await import("../../apps/creator-web/src/features/workspace/VibeUserBubble.tsx");
const { VibeRestorePoint } = await import("../../apps/creator-web/src/features/workspace/VibeRestorePoint.tsx");
const { WorkspaceHistoryPanel } = await import("../../apps/creator-web/src/features/workspace/WorkspaceHistoryPanel.tsx");
const { WorkspacePrdPanel } = await import("../../apps/creator-web/src/features/workspace/WorkspacePrdPanel.tsx");

function baseApp(overrides = {}) {
  return {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined, isVibing: false, vibeStatus: "",
    vibeTab: "preview", setVibeTab() {}, setVibePreviewKey() {}, vibeMessages: [],
    promptDraft: "", setPromptDraft() {}, cancelVibe() {}, handleVibeChat() {},
    approveAndImplement() {}, vibePreviewKey: 0, projectFiles: [], selectedAttachmentIds: [],
    isUploadingProjectFile: false, projectFileMessage: "", toggleProjectFileAttachment() {},
    handleUploadProjectFiles() {}, hasPreview: false, promptQueue: [], removeQueuedPrompt() {},
    bugReports: [], addBugReport() {}, dismissBugReport() {}, reloadChatHistory() {}, ...overrides
  };
}

test("Workspace renders a labeled four-view mobile switcher with one pressed view", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspacePage, { app: baseApp() }));
  assert.match(html, /aria-label="Workspace panels"/);
  for (const label of ["Conversation", "Preview", "Code", "Database"]) {
    assert.match(html, new RegExp(`aria-pressed="(?:true|false)"[^>]*>${label}<|>${label}<[^>]*aria-pressed="(?:true|false)"`));
  }
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /data-workspace-view="conversation"/);
  assert.match(html, />Completed</);
  assert.match(html, /Describe the change you want to make/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("completed technical actions are closed while active work stays expanded", () => {
  const completed = renderToStaticMarkup(React.createElement(VibeActionSummary, {
    actions: [{ id: "done-1", type: "edit", label: "app.tsx", status: "done", body: "saved" }]
  }));
  assert.match(completed, /<details[^>]*class="vibe-technical-details"/);
  assert.doesNotMatch(completed, /<details[^>]*open/);
  assert.match(completed, /1 completed technical action/);
  assert.match(completed, /app\.tsx/);
  const active = renderToStaticMarkup(React.createElement(VibeActionSummary, {
    actions: [{ id: "run-1", type: "edit", label: "dashboard.tsx", status: "running", body: "live command output" }]
  }));
  assert.match(active, /<details[^>]*open/);
  assert.match(active, />Working</);
  assert.match(active, /dashboard\.tsx/);
  assert.match(active, /live command output/);
});

test("completed reasoning is closed while live reasoning stays expanded", () => {
  const completed = renderToStaticMarkup(React.createElement(VibeReasoning, { reasoning: "Inspecting the route", live: false }));
  assert.match(completed, /<details[^>]*class="vibe-reasoning"/);
  assert.doesNotMatch(completed, /<details[^>]*open/);
  assert.match(completed, /View implementation reasoning/);
  assert.match(completed, /Inspecting the route/);
  const active = renderToStaticMarkup(React.createElement(VibeReasoning, { reasoning: "Inspecting the route", live: true }));
  assert.match(active, /<details[^>]*open/);
  assert.match(active, /Working/);
});

test("Workspace marks the current exchange and compacts older completed turns", () => {
  const messages = [
    { id: "u-old", role: "user", text: "Old request", actions: [] },
    { id: "a-old", role: "assistant", text: "Old response", actions: [] },
    { id: "u-now", role: "user", text: "Current request", actions: [] },
    { id: "a-now", role: "assistant", text: "Current response", actions: [] }
  ];
  const html = renderToStaticMarkup(React.createElement(WorkspacePage, { app: baseApp({ vibeMessages: messages }) }));
  assert.equal((html.match(/vibe-turn-current/g) ?? []).length, 2);
  assert.equal((html.match(/vibe-turn-compact/g) ?? []).length, 2);
});

test("clarifying question controls use English without changing submitted answers", () => {
  const questions = [{ id: "q-0", question: "Which region?", options: ["APAC", "EMEA"] }];
  const html = renderToStaticMarkup(React.createElement(VibeQuestionBlock, { questions, disabled: false, onSubmit() {} }));
  assert.match(html, /Select…/);
  assert.match(html, /Submit answers \(1\)/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("supporting Workspace surfaces render English operational copy", () => {
  const fragments = [
    React.createElement(PromptQueue, { items: [{ id: "q-1", prompt: "Add a report", mode: "auto" }], onRemove() {} }),
    React.createElement(BugReportBox, {
      bugs: [{ signature: "bug-1", source: "preview", message: "Button failed" }],
      disabled: false, onFix() {}, onDismiss() {}
    }),
    React.createElement(VibeUserBubble, { text: "[AUTO-DEBUG] Retry the preview" }),
    React.createElement(VibeRestorePoint, { projectId: "project_1", commitSha: "abc123", disabled: false, onRestored() {} }),
    React.createElement(WorkspaceHistoryPanel, { projectId: "project_1", messages: [], disabled: false, onRestored() {} }),
    React.createElement(WorkspacePrdPanel, {
      app: {
        visiblePrdSections: [], visibleVersionRows: [], prdMessage: "No PRD loaded.",
        currentPrdVersion: undefined, handleConfirmPrdBaseline() {}, handleGeneratePrdDraft() {},
        isGeneratingPrdDraft: false
      }
    })
  ];
  const html = fragments.map((fragment) => renderToStaticMarkup(fragment)).join("\n");
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
  assert.match(html, /Queued work \(1\)/);
  assert.match(html, /Restore to this point/);
  assert.match(html, /No versions yet/);
  assert.match(html, /No PRD is available for this project/);
});

test("Workspace responsive CSS selects one narrow panel and disables progress motion", async () => {
  const css = await readFile("packages/ui/styles.css", "utf8");
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*\.workspace-mobile-switcher[\s\S]*data-workspace-view="conversation"/);
  assert.doesNotMatch(css, /@media \(max-width: 899px\)[\s\S]*\.workspace-desktop-tabs\s*\{\s*display: none/);
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*\.workspace-desktop-tabs button[\s\S]*min-height: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.vibe-live-shell \.vibe-live-status-dot[\s\S]*animation: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.vibe-shimmer[\s\S]*animation: none/);
});
