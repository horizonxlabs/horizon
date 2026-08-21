import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatorShell } from "../../apps/creator-web/src/features/projects/CreatorShell.tsx";

globalThis.React = React;

const alphaProject = {
  id: "project-alpha",
  name: "Alpha Operations",
  appType: "Workflow App",
  owner: "Alex Morgan",
  status: "Draft"
};

const betaProject = {
  id: "project-beta",
  name: "Beta Finance",
  appType: "Dashboard",
  owner: "Blair Chen",
  status: "Ready"
};

function creatorApp(overrides = {}) {
  return {
    creatorNavItems: [{ label: "Projects", route: "/creator/", icon: "workspace" }],
    bootstrap: {
      userName: "Creator User",
      projects: [alphaProject, betaProject]
    },
    creatorSessionControls: null,
    creatorPage: "prd",
    pageCopy: {
      eyebrow: "PRD Baseline",
      title: "PRD Review: Leave Management",
      description: "Review the product requirements."
    },
    selectedProject: alphaProject,
    creatorPageActions: undefined,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen() {},
    handleCreateProjectSubmit() {},
    isCreatingProject: false,
    createProjectForm: {},
    handleCreateProjectField() {},
    createProjectMessage: "",
    isEnteringWorkspace: false,
    handleSelectProject() {},
    onNavigate() {},
    pathname: "/creator/projects/project-alpha/prd",
    ...overrides
  };
}

test("Creator sidebar identifies the active project in a project switcher", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorShell, {
      app: creatorApp(),
      content: React.createElement("p", null, "Page content")
    })
  );

  assert.match(html, /aria-label="Switch project\. Current project: Alpha Operations"/);
  assert.match(html, />Alpha Operations</);
  assert.match(html, /aria-haspopup="listbox"/);
});

test("Creator project landing keeps a selected project as the active context", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorShell, {
      app: creatorApp({ creatorPage: "projects", pathname: "/creator/" }),
      content: React.createElement("p", null, "Projects")
    })
  );

  assert.match(html, /aria-label="Switch project\. Current project: Alpha Operations"/);
  assert.match(html, />Alpha Operations</);
});

test("project switching preserves the selected project context until navigation", async () => {
  const routeModule = await import("../../apps/creator-web/src/app/routes.ts");
  const targetPage = routeModule.projectSwitchTargetPage;

  assert.equal(typeof targetPage, "function");
  assert.equal(targetPage?.("projects"), "workspace");
  assert.equal(targetPage?.("prd"), "prd");
  assert.equal(targetPage?.("ticket-detail"), "tickets");
  assert.equal(targetPage?.("not-found"), "workspace");
});
