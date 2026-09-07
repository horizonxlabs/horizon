import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= {
  location: {
    pathname: "/creator/projects/project-1",
    href: "http://localhost/creator/projects/project-1"
  },
  localStorage: storage,
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
globalThis.fetch = async () => ({
  ok: false,
  status: 401,
  json: async () => ({}),
  text: async () => ""
});

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { WorkspacePage } =
  await import("../../apps/creator-web/src/features/workspace/WorkspacePage.tsx");

function appFor(messages, overrides = {}) {
  return {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined,
    isVibing: false,
    vibeStatus: "Completed",
    vibeTab: "preview",
    setVibeTab() {},
    setVibePreviewKey() {},
    vibeMessages: messages,
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
    visiblePrdSections: [],
    visibleVersionRows: [],
    prdMessage: "",
    handleConfirmPrdBaseline() {},
    handleGeneratePrdDraft() {},
    isGeneratingPrdDraft: false,
    ...overrides
  };
}

test("a completed assistant turn groups its tools into one collapsed Activity card", async () => {
  const message = {
    id: "a-activity",
    role: "assistant",
    text: "",
    actions: [],
    parts: [
      {
        id: "tool-read",
        type: "tool",
        sequence: 0,
        tool: {
          callId: "read-1",
          actionType: "read",
          label: "Read workspace file",
          inputSummary: "Read app/page.tsx",
          startedAt: "2026-09-06T00:00:00.000Z",
          endedAt: "2026-09-06T00:00:01.000Z",
          status: "done",
          result: "export default function Page() {}"
        }
      },
      {
        id: "tool-edit",
        type: "tool",
        sequence: 1,
        tool: {
          callId: "edit-1",
          actionType: "edit",
          label: "Edit workspace file",
          inputSummary: "Edit app/page.tsx",
          startedAt: "2026-09-06T00:00:01.000Z",
          endedAt: "2026-09-06T00:00:02.000Z",
          status: "done",
          result: "Updated app/page.tsx"
        }
      }
    ]
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app: appFor([message]) }));
  });

  const activityCards = renderer.root.findAllByProps({ className: "vibe-technical-details" });
  assert.equal(activityCards.length, 1);
  assert.equal(activityCards[0].props.open, undefined);
  assert.match(JSON.stringify(renderer.toJSON()), /Activity/);
  assert.match(JSON.stringify(renderer.toJSON()), /2 steps completed/);
  assert.ok(activityCards[0].findByProps({ className: "lucide lucide-list-checks" }));
  assert.ok(activityCards[0].findByProps({ className: "lucide lucide-search" }));
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /🔍|📂|✏️|⚡/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /✓ |✗ /);
});

test("an edit Activity shows the target file and its before/after change", async () => {
  const message = {
    id: "a-edit-detail",
    role: "assistant",
    text: "",
    actions: [],
    parts: [
      {
        id: "tool-edit-detail",
        type: "tool",
        sequence: 0,
        tool: {
          callId: "edit-detail-1",
          actionType: "edit",
          label: "app/page.tsx",
          inputSummary: "Edit app/page.tsx",
          startedAt: "2026-09-07T00:00:00.000Z",
          endedAt: "2026-09-07T00:00:01.000Z",
          status: "done",
          find: "const title = 'Old';",
          replace: "const title = 'New';"
        }
      }
    ]
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app: appFor([message]) }));
  });

  const action = renderer.root.findByProps({ className: "vibe-action-summary" });
  await act(async () => action.props.onClick());
  const rendered = JSON.stringify(renderer.toJSON());
  assert.match(rendered, /app\/page\.tsx/);
  assert.match(rendered, /Before/);
  assert.match(rendered, /const title = 'Old';/);
  assert.match(rendered, /After/);
  assert.match(rendered, /const title = 'New';/);
});

test("assistant commentary stays interleaved with separate contiguous Activity groups", async () => {
  const toolPart = (id, sequence, actionType, label) => ({
    id,
    type: "tool",
    sequence,
    tool: {
      callId: id,
      actionType,
      label,
      inputSummary: label,
      startedAt: "2026-09-06T00:00:00.000Z",
      endedAt: "2026-09-06T00:00:01.000Z",
      status: "done",
      result: `${label} complete`
    }
  });
  const message = {
    id: "a-interleaved-activity",
    role: "assistant",
    text: "",
    actions: [],
    parts: [
      {
        id: "text-inspect",
        type: "text",
        sequence: 0,
        text: "I’ll inspect the project structure before changing the page."
      },
      toolPart("read-1", 1, "read", "Read workspace file"),
      toolPart("list-1", 2, "list", "List workspace files"),
      {
        id: "text-edit",
        type: "text",
        sequence: 3,
        text: "I found the relevant files. Next I’ll update the page and verify it."
      },
      toolPart("edit-1", 4, "edit", "Edit workspace file"),
      toolPart("shell-1", 5, "shell", "Run project checks")
    ]
  };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app: appFor([message]) }));
  });

  const timeline = renderer.root.findByProps({ className: "vibe-turn-timeline" });
  assert.equal(timeline.findAllByProps({ className: "vibe-technical-details" }).length, 2);

  const rendered = JSON.stringify(renderer.toJSON());
  const firstCommentary = rendered.indexOf("I’ll inspect the project structure");
  const firstActivity = rendered.indexOf("Loaded tools and read files");
  const secondCommentary = rendered.indexOf("I found the relevant files");
  const secondActivity = rendered.indexOf("Edited files and ran checks");
  assert.ok(firstCommentary < firstActivity);
  assert.ok(firstActivity < secondCommentary);
  assert.ok(secondCommentary < secondActivity);
  assert.match(rendered, /Loaded tools and read files/);
  assert.match(rendered, /Edited files and ran checks/);
});

test("a running Activity card shows only the current tool until the turn completes", async () => {
  const message = {
    id: "a-running-activity",
    role: "assistant",
    text: "",
    actions: [],
    parts: [
      {
        id: "tool-complete",
        type: "tool",
        sequence: 0,
        tool: {
          callId: "read-complete",
          actionType: "read",
          label: "Read old file",
          inputSummary: "Read old file",
          startedAt: "2026-09-06T00:00:00.000Z",
          endedAt: "2026-09-06T00:00:01.000Z",
          status: "done",
          result: "old"
        }
      },
      {
        id: "tool-running",
        type: "tool",
        sequence: 1,
        tool: {
          callId: "edit-running",
          actionType: "edit",
          label: "Update dashboard",
          inputSummary: "Edit dashboard",
          startedAt: "2026-09-06T00:00:01.000Z",
          status: "running",
          progress: "Updating dashboard"
        }
      }
    ]
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(WorkspacePage, {
        app: appFor([message], { isVibing: true, vibeStatus: "Working" })
      })
    );
  });

  const activity = renderer.root.findByProps({ className: "vibe-technical-details" });
  assert.equal(activity.props.open, true);
  assert.equal(
    activity.findAll((node) => (node.props.className ?? "").startsWith("vibe-action-row ")).length,
    1
  );
  const rendered = JSON.stringify(renderer.toJSON());
  assert.match(rendered, /Update dashboard/);
  assert.doesNotMatch(rendered, /Read old file/);
});

test("a failed Activity card exposes its error-state class", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(WorkspacePage, {
        app: appFor([
          {
            id: "a-failed-activity",
            role: "assistant",
            text: "",
            actions: [],
            parts: [
              {
                id: "tool-failed",
                type: "tool",
                sequence: 0,
                tool: {
                  callId: "shell-failed",
                  actionType: "shell",
                  label: "Run project checks",
                  inputSummary: "Run project checks",
                  startedAt: "2026-09-06T00:00:00.000Z",
                  endedAt: "2026-09-06T00:00:01.000Z",
                  status: "failed",
                  error: "Build failed"
                }
              }
            ]
          }
        ])
      })
    );
  });

  assert.ok(renderer.root.findByProps({ className: "vibe-technical-details has-failed" }));
});

test("a commit is presented as project history status instead of raw console output", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(WorkspacePage, {
        app: appFor([
          {
            id: "a-commit",
            role: "assistant",
            text: "",
            actions: [],
            parts: [
              {
                id: "commit-1",
                type: "commit",
                sequence: 0,
                sha: "1234567890abcdef"
              }
            ]
          }
        ])
      })
    );
  });

  const status = renderer.root.findByProps({ className: "vibe-commit-status" });
  assert.equal(status.props.title, "Commit 12345678");
  assert.match(JSON.stringify(renderer.toJSON()), /Saved to project history/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /committed 12345678/);
});
