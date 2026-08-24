import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { CreatorState, CreatorStatusMessage } =
  await import("../../apps/creator-web/src/shared/index.ts");
const { CreatorShell } =
  await import("../../apps/creator-web/src/features/projects/CreatorShell.tsx");
const { ProjectOverviewPage } =
  await import("../../apps/creator-web/src/features/project-overview/ProjectOverviewPage.tsx");
const { ProjectsPage } =
  await import("../../apps/creator-web/src/features/projects/ProjectsPage.tsx");
const { AppShell, Button, DataTable } = await import("../../packages/ui/src/index.tsx");
const { creatorPageCopy } = await import("../../apps/creator-web/src/app/routes.ts");
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

test("CreatorState renders a recoverable error with optional technical details", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorState, {
      kind: "error",
      title: "Versions could not be loaded",
      description: "Your existing checkpoints are unchanged.",
      action: React.createElement("button", null, "Retry"),
      technicalDetails: "HTTP 503"
    })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Versions could not be loaded/);
  assert.match(html, /Technical details/);
  assert.match(html, /Retry/);
});

test("CreatorStatusMessage maps danger feedback to alert semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorStatusMessage, { tone: "danger" }, "Publish failed")
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /creator-status-message-danger/);
});

test("DataTable exposes a labeled scroll region and contextual empty state", () => {
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      ariaLabel: "Project members",
      columns: [{ key: "name", label: "Name" }],
      rows: [],
      emptyMessage: "No members have access yet."
    })
  );
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Project members"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /No members have access yet/);
});

test("DataTable leaves existing unlabeled callers out of the tab order", () => {
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      columns: [{ key: "name", label: "Name" }],
      rows: []
    })
  );
  assert.doesNotMatch(html, /role="region"/);
  assert.doesNotMatch(html, /tabindex="0"/);
});

test("Button supports a danger-outline action hierarchy", () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { variant: "dangerOutline" }, "Reject")
  );
  assert.match(html, /text-danger/);
  assert.match(html, /border-danger/);
  assert.match(html, /max-md:min-h-\[44px\]/);
});

test("Creator shell renders 14px navigation and a 44px collapsed sidebar control", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { pathname: "/creator/projects/leave-management/project" },
    localStorage: {
      getItem: () => "true"
    }
  };

  try {
    const html = renderToStaticMarkup(
      React.createElement(
        AppShell,
        {
          title: "Horizon",
          navItems: [{ label: "Project", route: "/creator/projects/leave-management/project" }],
          userName: "Creator"
        },
        "Creator content"
      )
    );
    assert.match(html, /text-\[14px\]/);
    assert.match(html, /app-shell-sidebar-toggle[^>]+h-11[^>]+w-11/);
    assert.match(html, /aria-label="Expand sidebar"/);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("authenticated Creator route copy is concise English", () => {
  const expectedCopy = {
    project: [
      "Project: Leave Management",
      "Review project status, key information, and common actions."
    ],
    workspace: [
      "Creator Workspace: Leave Management",
      "Build and refine the application through guided AI changes."
    ],
    prd: [
      "PRD Review: Leave Management",
      "Review requirements, version history, and the confirmed product baseline."
    ],
    database: ["Database", "Review project schema, tables, and records."],
    versions: [
      "Frontend Versions",
      "Review checkpoints and restore the frontend without changing backend data."
    ],
    users: [
      "Users & Roles",
      "Manage members, invitations, access requests, and role permissions."
    ],
    publish: [
      "Publish & Registry",
      "Review readiness and register the application for end users."
    ],
    deployments: [
      "Deployments",
      "Review deployment environments, versions, health, and timestamps."
    ],
    tickets: ["Tickets & Changes", "Turn Store feedback into tracked product changes."],
    settings: ["Project Settings", "Manage project information and permanent deletion."]
  };

  for (const [page, [title, description]] of Object.entries(expectedCopy)) {
    assert.equal(creatorPageCopy[page].title, title);
    assert.equal(creatorPageCopy[page].description, description);
  }

  for (const copy of Object.values(creatorPageCopy)) {
    assert.doesNotMatch(`${copy.title} ${copy.description}`, /[\u0E00-\u0E7F]/);
  }
});

test("Creator shell uses English provisioning feedback and omits duplicate page eyebrows", () => {
  const pageCopy = {
    eyebrow: "Publish & Registry",
    title: "Publish & Registry",
    description: "Review readiness and register the application for end users."
  };
  const html = renderToStaticMarkup(
    React.createElement(CreatorShell, {
      app: {
        creatorNavItems: [],
        bootstrap: { projects: [], userName: "Creator" },
        creatorSessionControls: null,
        creatorPage: "publish",
        pageCopy,
        selectedProject: { id: "leave-management", name: "Leave Management" },
        creatorPageActions: null,
        isCreateProjectDialogOpen: false,
        setIsCreateProjectDialogOpen: () => undefined,
        handleCreateProjectSubmit: () => undefined,
        isCreatingProject: false,
        createProjectForm: {},
        handleCreateProjectField: () => undefined,
        createProjectMessage: "",
        isEnteringWorkspace: true,
        handleSelectProject: async () => undefined,
        onNavigate: () => undefined,
        pathname: "/creator/projects/leave-management/publish"
      },
      content: React.createElement("div", null, "Publish content")
    })
  );

  assert.match(html, /Preparing workspace/);
  assert.match(html, /Starting this project&#x27;s sandbox\. This may take a moment\./);
  assert.equal((html.match(/Publish &amp; Registry/g) ?? []).length, 1);
});

test("Projects landing renders readable metadata and an English creation wizard", () => {
  const project = {
    id: "operations-hub",
    name: "Operations Hub",
    appType: "Workflow",
    status: "in_review",
    owner: "Creator",
    prdVersion: "v1",
    frontendVersion: "v2",
    tokenUsedThisMonth: 0,
    createdAt: "2026-01-02T00:00:00.000Z"
  };
  const html = renderToStaticMarkup(
    React.createElement(ProjectsPage, {
      app: {
        creatorNavItems: [], bootstrap: { projects: [project], userName: "Creator" },
        creatorSessionControls: null, creatorPage: "projects",
        pageCopy: { title: "Projects", description: "Create and select a project." },
        selectedProject: project, creatorPageActions: null, isCreateProjectDialogOpen: true,
        setIsCreateProjectDialogOpen: () => undefined, handleCreateProjectSubmit: () => undefined,
        isCreatingProject: false,
        createProjectForm: {
          name: "", appType: "", targetDepartment: "", businessProblem: "",
          intendedUsers: "", dataSensitivity: "internal"
        },
        handleCreateProjectField: () => undefined,
        createProjectMessage: "Complete the project details to prepare the first workspace draft.",
        isEnteringWorkspace: false, handleSelectProject: async () => undefined,
        onNavigate: () => undefined, pathname: "/creator"
      }
    })
  );

  assert.match(html, /In review/);
  assert.match(html, /Created/);
  assert.match(html, /Jan 2, 2026/);
  assert.match(html, /class="hz-card-app-type">Workflow/);
  assert.match(html, /Application type/);
  assert.match(html, /Business problem/);
  assert.match(html, /Create project/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("Project dashboard renders English details, actions, and an English-locale created date", () => {
  const selectedProject = {
    id: "leave-management",
    name: "Leave Management",
    appType: "Workflow",
    status: "in_review",
    owner: "Creator",
    prdVersion: "v3",
    frontendVersion: "v7",
    createdAt: "2026-01-02T00:00:00.000Z"
  };
  const html = renderToStaticMarkup(
    React.createElement(ProjectOverviewPage, {
      app: {
        creatorNavItems: [],
        bootstrap: { projects: [selectedProject], userName: "Creator" },
        creatorSessionControls: null,
        creatorPage: "project",
        pageCopy: creatorPageCopy.project,
        selectedProject,
        creatorPageActions: null,
        isCreateProjectDialogOpen: false,
        setIsCreateProjectDialogOpen: () => undefined,
        handleCreateProjectSubmit: () => undefined,
        isCreatingProject: false,
        createProjectForm: {},
        handleCreateProjectField: () => undefined,
        createProjectMessage: "",
        isEnteringWorkspace: false,
        handleSelectProject: async () => undefined,
        onNavigate: () => undefined,
        pathname: "/creator/projects/leave-management/project"
      }
    })
  );

  assert.match(html, /Key project information and shortcuts for managing this project\./);
  assert.match(html, /creator-project-summary/);
  assert.match(html, /creator-project-overview-grid/);
  assert.match(html, /In review/);
  assert.match(html, /Project information/);
  assert.match(html, /Quick actions/);
  assert.match(html, /Open workspace/);
  assert.match(html, /Manage database/);
  assert.match(html, /Jan 2, 2026/);
  assert.doesNotMatch(html, />Project overview</);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("AppShell opens and closes the real mobile drawer with 44px controls", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = {
    location: { pathname: "/creator" },
    localStorage: { getItem: () => null, setItem: () => undefined },
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };

  let renderer;
  try {
    await act(async () => {
      renderer = create(
        React.createElement(
          AppShell,
          {
            title: "Horizon",
            navItems: [{ label: "Project", route: "/creator", icon: "dashboard" }],
            userName: "Creator"
          },
          "Creator content"
        )
      );
    });

    const findOpenTrigger = () =>
      renderer.root.find(
        (node) => node.type === "button" && node.props["aria-label"] === "Open navigation"
      );
    const findCloseControl = () =>
      renderer.root.find(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"] === "Close navigation" &&
          node.props.className.includes("max-md:ml-auto")
      );
    let openTrigger = findOpenTrigger();
    let closeControl = findCloseControl();
    let sidebar = renderer.root.findByType("aside");
    assert.equal(openTrigger.props["aria-expanded"], false);
    assert.match(openTrigger.props.className, /max-md:h-\[44px\].*max-md:w-\[44px\]/);
    assert.match(closeControl.props.className, /max-md:h-\[44px\].*max-md:w-\[44px\]/);
    assert.match(sidebar.props.className, /max-md:-translate-x-full/);

    await act(async () => openTrigger.props.onClick());

    openTrigger = findOpenTrigger();
    closeControl = findCloseControl();
    sidebar = renderer.root.findByType("aside");
    assert.equal(openTrigger.props["aria-expanded"], true);
    assert.equal(closeControl.props["aria-label"], "Close navigation");
    assert.match(sidebar.props.className, /max-md:translate-x-0/);

    await act(async () => closeControl.props.onClick());

    sidebar = renderer.root.findByType("aside");
    assert.match(sidebar.props.className, /max-md:-translate-x-full/);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});
