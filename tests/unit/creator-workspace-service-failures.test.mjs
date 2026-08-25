import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window ??= {
  location: { pathname: "/creator/projects/project-1", href: "http://localhost:9800/creator/" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document ??= { addEventListener() {}, removeEventListener() {} };

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { WorkspaceCodePanel } =
  await import("../../apps/creator-web/src/features/workspace/WorkspaceCodePanel.tsx");
const { VibeRestorePoint } =
  await import("../../apps/creator-web/src/features/workspace/VibeRestorePoint.tsx");
const { useProjectFiles } =
  await import("../../apps/creator-web/src/features/workspace/use-project-files.ts");

function failureResponse(status, message) {
  return new Response(
    JSON.stringify({ ok: false, error: { code: `HTTP_${status}`, message } }),
    { status, headers: { "content-type": "application/json" } }
  );
}

test("Code panel discloses the raw loading exception only as technical details", async () => {
  globalThis.fetch = async () => failureResponse(503, "workspace service unavailable");
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspaceCodePanel, { projectId: "project-1" }));
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(renderer.root.findByType("strong").children.join(""), "Workspace files unavailable");
  assert.match(renderer.root.findByType("p").children.join(""), /Try again/);
  assert.match(renderer.root.findByType("pre").children.join(""), /Provisioning workspace failed/);
  await act(async () => renderer.unmount());
});

test("Restore point keeps a failed restore exception behind Technical details", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "git reset rejected by workspace lock" }), {
      status: 409,
      headers: { "content-type": "application/json" }
    });
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(VibeRestorePoint, {
        projectId: "project-1",
        commitSha: "abc123",
        disabled: false,
        onRestored() {}
      })
    );
  });
  await act(async () => renderer.root.findByType("button").props.onClick());
  const confirm = renderer.root
    .findAllByType("button")
    .find((button) => button.children.join("") === "Confirm");
  await act(async () => {
    await confirm.props.onClick();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /Restore failed\. Try again\./);
  assert.match(renderer.root.findByType("pre").children.join(""), /git reset rejected/);
  await act(async () => renderer.unmount());
});

test("Project file upload returns user copy and a separate technical exception", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/files") && (!init.method || init.method === "GET")) {
      return new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return failureResponse(503, "object storage credentials rejected");
  };
  let latest;
  function Harness() {
    latest = useProjectFiles("project-1");
    return React.createElement("output", null, latest.projectFileMessage);
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
    await new Promise((resolve) => setImmediate(resolve));
  });
  const file = {
    name: "brief.txt",
    type: "text/plain",
    size: 5,
    arrayBuffer: async () => new TextEncoder().encode("brief").buffer,
    text: async () => "brief"
  };
  await act(async () => {
    await latest.handleUploadProjectFiles([file]);
  });
  assert.equal(latest.projectFileMessage, "Project file upload failed. Try again.");
  assert.equal(latest.projectFileTechnicalDetails, "object storage credentials rejected");
  await act(async () => renderer.unmount());
});
