import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;

globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { ProjectSwitcher } = await import(
  "../../apps/creator-web/src/features/projects/ProjectSwitcher.tsx"
);

const projects = [
  { id: "project-1", name: "Project One", appType: "Workflow", owner: "Alice" },
  { id: "project-2", name: "Project Two", appType: "Dashboard", owner: "Bob" }
];

test("project switcher lists only selectable projects", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(ProjectSwitcher, {
        projects,
        selectedProject: projects[0],
        currentPage: "workspace",
        onSelectProject() {},
        onCreateProject() {}
      })
    );
  });

  await act(async () => renderer.root.findAllByType("button")[0].props.onClick());

  const options = renderer.root.findAll((node) => node.props.role === "option");
  assert.deepEqual(
    options.map((option) => option.findByType("strong").children.join("")),
    ["Project One", "Project Two"]
  );

  await act(async () => renderer.unmount());
});

test("project switcher shows the selected project on the Creator landing page", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(ProjectSwitcher, {
        projects,
        selectedProject: projects[1],
        currentPage: "projects",
        onSelectProject() {},
        onCreateProject() {}
      })
    );
  });

  const trigger = renderer.root.findAllByType("button")[0];
  assert.equal(trigger.findByType("strong").children.join(""), "Project Two");

  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
