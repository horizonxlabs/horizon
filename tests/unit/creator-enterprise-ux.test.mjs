import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { CreatorState, CreatorStatusMessage } =
  await import("../../apps/creator-web/src/shared/index.ts");
const { CreatorShell } =
  await import("../../apps/creator-web/src/features/projects/CreatorShell.tsx");
const { AppShell, Button, DataTable } = await import("../../packages/ui/src/index.tsx");
const { creatorPageCopy } = await import("../../apps/creator-web/src/app/routes.ts");

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
