import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceHistoryPanel } from "../../apps/creator-web/src/features/workspace/WorkspaceHistoryPanel.tsx";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const messages = [
  { id: "u1", role: "user", text: "สร้างแอปคำนวณดอกเบี้ย", actions: [] },
  { id: "a1", role: "assistant", text: "Done", actions: [], commitSha: "aaa111bbb222" },
  { id: "u2", role: "user", text: "[AUTO-DEBUG] repair", actions: [] },
  { id: "a2", role: "assistant", text: "Done", actions: [], commitSha: "ccc333ddd444" }
];
const props = { projectId: "project_1", messages, disabled: false, onRestored() {} };

test("history shows saved versions newest first with one current version and restore only for older code", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceHistoryPanel, props));
  assert.match(html, /Version history/);
  assert.match(html, /class="vibe-history-item is-current"/);
  assert.match(html, /2 versions/);
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
  assert.ok(html.indexOf("ccc333dd") < html.indexOf("aaa111bb"));
  assert.equal((html.match(/Restore to this point/g) ?? []).length, 1);
  assert.match(html, /Automatic fix/);
  assert.match(html, /สร้างแอปคำนวณดอกเบี้ย/);
  assert.doesNotMatch(html, /\[AUTO-DEBUG\]/);
});

test("history has a useful empty state and a compact single-version layout", () => {
  const empty = renderToStaticMarkup(
    React.createElement(WorkspaceHistoryPanel, { ...props, messages: [] })
  );
  assert.match(empty, /No versions yet/);
  assert.match(empty, /0 versions/);
  assert.doesNotMatch(empty, /Restore to this point/);
  const single = renderToStaticMarkup(
    React.createElement(WorkspaceHistoryPanel, { ...props, messages: messages.slice(0, 2) })
  );
  assert.match(single, /1 version</);
  assert.match(single, /Current/);
  assert.doesNotMatch(single, /Restore to this point/);
});

test("restoring still requires confirmation and can be cancelled without changing the workspace", async () => {
  let restored = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(WorkspaceHistoryPanel, { ...props, onRestored: () => restored++ })
    );
  });
  try {
    await act(async () =>
      renderer.root.findByProps({ className: "vibe-restore-button" }).props.onClick()
    );
    const dialog = renderer.root.findByProps({ role: "alertdialog" });
    assert.match(
      JSON.stringify(dialog.children[0].props.children),
      /All later work will be removed/
    );
    const cancel = dialog
      .findAllByType("button")
      .find((button) => button.children.includes("Cancel"));
    await act(async () => cancel.props.onClick());
    assert.equal(renderer.root.findAllByProps({ role: "alertdialog" }).length, 0);
    assert.equal(restored, 0);
    await act(async () =>
      renderer.update(React.createElement(WorkspaceHistoryPanel, { ...props, disabled: true }))
    );
    assert.equal(
      renderer.root.findByProps({ className: "vibe-restore-button" }).props.disabled,
      true
    );
  } finally {
    await act(async () => renderer.unmount());
  }
});
