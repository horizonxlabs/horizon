import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React, { useState } from "react";

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

function appFor(vibeTab, setVibeTab) {
  return {
    selectedProject: { id: "project_1", name: "Project One", appType: "Internal app" },
    currentPrdVersion: undefined,
    isVibing: false,
    vibeStatus: "Completed",
    vibeTab,
    setVibeTab,
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
    visiblePrdSections: [],
    visibleVersionRows: [],
    prdMessage: "",
    handleConfirmPrdBaseline() {},
    handleGeneratePrdDraft() {},
    isGeneratingPrdDraft: false
  };
}

test("mobile selection and desktop tabs keep the selected Workspace panel synchronized", async () => {
  function Harness() {
    const [vibeTab, setVibeTab] = useState("preview");
    return React.createElement(WorkspacePage, { app: appFor(vibeTab, setVibeTab) });
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  const workspaceBody = () => renderer.root.findByProps({ className: "vibe-live-body" });
  const switcher = renderer.root.findByProps({ "aria-label": "Workspace panels" });
  const codeButton = switcher
    .findAllByType("button")
    .find((button) => button.children.includes("Code"));
  await act(async () => codeButton.props.onClick());
  assert.equal(workspaceBody().props["data-workspace-view"], "code");
  assert.equal(codeButton.props["aria-pressed"], true);

  const databaseTab = renderer.root
    .findAll((node) => node.props.role === "tab")
    .find((tab) => tab.children.includes("Database"));
  await act(async () => databaseTab.props.onClick());
  assert.equal(workspaceBody().props["data-workspace-view"], "database");
});

test("PRD and History do not announce Preview as selected and Preview remains selectable", async () => {
  function Harness() {
    const [vibeTab, setVibeTab] = useState("preview");
    return React.createElement(WorkspacePage, { app: appFor(vibeTab, setVibeTab) });
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  const tabNamed = (name) =>
    renderer.root
      .findAll((node) => node.props.role === "tab")
      .find((tab) => tab.children.includes(name));
  const switcherButtons = () =>
    renderer.root.findByProps({ "aria-label": "Workspace panels" }).findAllByType("button");
  const pressedLabels = () =>
    switcherButtons()
      .filter((button) => button.props["aria-pressed"])
      .flatMap((button) => button.children);

  await act(async () => tabNamed("PRD").props.onClick());
  assert.deepEqual(pressedLabels(), []);
  assert.ok(renderer.root.findByProps({ className: "vibe-prd-panel" }));

  await act(async () => tabNamed("History").props.onClick());
  assert.deepEqual(pressedLabels(), []);
  const historyStatus = renderer.root
    .findAllByProps({ role: "status" })
    .find((status) => status.children.join("").includes("No versions yet"));
  assert.ok(historyStatus);

  const previewButton = switcherButtons().find((button) => button.children.includes("Preview"));
  await act(async () => previewButton.props.onClick());
  assert.deepEqual(pressedLabels(), ["Preview"]);
});

test("authorized Preview keeps visible sandbox progress until the iframe has loaded", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { authorized: true, previewKey: "project-1" } })
  });
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(WorkspacePage, { app: appFor("preview", () => {}) }));
    });

    const iframe = renderer.root.findByType("iframe");
    const loadingState = renderer.root.findByProps({ "data-preview-loading": true });
    assert.ok(loadingState);
    assert.match(JSON.stringify(renderer.toJSON()), /Preparing app preview/);
    assert.match(JSON.stringify(renderer.toJSON()), /Starting the secure sandbox/);

    await act(async () => iframe.props.onLoad());
    assert.equal(renderer.root.findAllByProps({ "data-preview-loading": true }).length, 0);
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = previousFetch;
  }
});

test("busy message composer groups status and queue controls into one professional action surface", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(WorkspacePage, {
        app: { ...appFor("preview", () => {}), isVibing: true, vibeStatus: "Working" }
      })
    );
  });

  const composer = renderer.root.findByProps({ className: "vibe-live-composer is-busy" });
  assert.ok(composer.findByProps({ className: "vibe-working" }));
  assert.ok(composer.findByProps({ className: "lucide lucide-paperclip" }));
  assert.equal(
    composer.findByProps({ className: "vibe-composer-queue-status" }).children.at(-1),
    "Queues after current task"
  );
  const stopControl = composer.findByProps({ "aria-label": "Stop generation" });
  assert.equal(stopControl.findByType("span").children.join(""), "Stop");
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Next prompt queues automatically/);
});

test("a detected bug creates an English fix draft through BugReportBox and the composer", async () => {
  const bug = {
    signature: "runtime:save",
    source: "preview-runtime",
    file: "src/features/save.ts",
    message: "Save button throws when the title is empty"
  };
  function Harness() {
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState([]);
    const app = {
      ...appFor("preview", () => {}),
      promptDraft: draft,
      setPromptDraft: setDraft,
      vibeMessages: messages,
      bugReports: [bug],
      handleVibeChat() {
        setMessages([{ id: "bug-request", role: "user", text: draft, actions: [] }]);
        setDraft("");
      }
    };
    return React.createElement(WorkspacePage, { app });
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  const fixButton = renderer.root
    .findAllByType("button")
    .find((button) => button.children.some((child) => child === "Fix bug"));
  await act(async () => fixButton.props.onClick());
  const composer = renderer.root.findByProps({
    "aria-label": "Describe the change you want to make"
  });
  assert.match(composer.props.value, /^Fix this bug/);
  assert.match(composer.props.value, /Save button throws when the title is empty/);
  assert.match(composer.props.value, /preview-runtime/);
  assert.match(composer.props.value, /src\/features\/save\.ts/);
  assert.doesNotMatch(composer.props.value, /[\u0E00-\u0E7F]/);

  const send = renderer.root.findByProps({ "aria-label": "Send prompt" });
  await act(async () => send.props.onClick());
  const userBubble = renderer.root.findByProps({
    className: "vibe-message vibe-message-user vibe-turn-current"
  });
  assert.match(userBubble.children.join(""), /Fix this bug/);
  assert.doesNotMatch(userBubble.children.join(""), /[\u0E00-\u0E7F]/);
});

test("Workspace failure recovery retries the latest user request", async () => {
  const submissions = [];
  const app = {
    ...appFor("preview", () => {}),
    vibeStatus: "Failed",
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
    handleVibeChat(options) {
      submissions.push(options.prompt);
    }
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app }));
  });

  const retry = renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Retry access"));
  await act(async () => retry.props.onClick());
  assert.equal(submissions.length, 1);
  assert.match(submissions[0], /Retry the previous request after this error/);
  assert.match(submissions[0], /Original request:\nBuild the first preview/);
  assert.match(submissions[0], /Latest error:\nVault secret operation failed \(403\)/);
  assert.match(submissions[0], /diagnose the error, apply a safe fix, and continue/i);
});

test("Workspace keeps an accessible conversation restore control after collapse", async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app: appFor("preview", () => {}) }));
  });

  const collapse = renderer.root.findByProps({ "aria-label": "Collapse conversation panel" });
  await act(async () => collapse.props.onClick({ stopPropagation() {} }));
  const collapsedLayout = renderer.root.find(
    (node) => node.props.className === "vibe-live-body is-chat-collapsed"
  );
  const expand = renderer.root
    .findAllByProps({ "aria-label": "Expand conversation panel" })
    .find((node) => node.type === "button");
  const separator = renderer.root.findByProps({ role: "separator" });

  // Interactive controls nested inside role=separator are hidden from the accessibility tree.
  // The restore button must remain a sibling so it is both visible and keyboard reachable.
  assert.equal(separator.findAllByProps({ "aria-label": "Expand conversation panel" }).length, 0);
  assert.ok(collapsedLayout);
  assert.ok(expand);

  await act(async () => expand.props.onClick({ stopPropagation() {} }));
  assert.ok(renderer.root.findByProps({ "aria-label": "Collapse conversation panel" }));
});

test("the attachment control is a keyboard-reachable native button wired to its file input", async () => {
  let inputClicks = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspacePage, { app: appFor("preview", () => {}) }), {
      createNodeMock(element) {
        if (element.type === "input" && element.props.type === "file") {
          return {
            click() {
              inputClicks += 1;
            }
          };
        }
        return null;
      }
    });
  });
  const attach = renderer.root.findByProps({ "aria-label": "Attach files" });
  assert.equal(attach.type, "button");
  assert.equal(attach.props.type, "button");
  assert.notEqual(attach.props.tabIndex, -1);
  await act(async () => attach.props.onClick());
  assert.equal(inputClicks, 1);
});
