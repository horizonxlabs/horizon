import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window ??= {
  location: { pathname: "/creator/projects/payroll/settings" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
};

const { canConfirmProjectDeletion } =
  await import("../../apps/creator-web/src/features/project-settings/deletion-state.ts");
const { useProjectDeletion } =
  await import("../../apps/creator-web/src/features/project-settings/use-project-deletion.ts");
const { ProjectDeletionConfirmation, ProjectSettingsPage } =
  await import("../../apps/creator-web/src/features/project-settings/ProjectSettingsPage.tsx");
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

test("project deletion unlocks only when the confirmation exactly matches the project name", () => {
  assert.equal(canConfirmProjectDeletion("Payroll", "Payroll"), true);
  assert.equal(canConfirmProjectDeletion("payroll", "Payroll"), false);
  assert.equal(canConfirmProjectDeletion("Payroll ", "Payroll"), false);
  assert.equal(canConfirmProjectDeletion("", "Payroll"), false);
});

test("project settings presents neutral information and a distinct danger zone", () => {
  const project = {
    id: "payroll",
    name: "Payroll",
    appType: "Workflow",
    status: "active",
    owner: "Creator",
    prdVersion: "v1",
    frontendVersion: "v2",
    tokenUsedThisMonth: 0,
    createdAt: "2026-01-02T00:00:00.000Z"
  };
  const html = renderToStaticMarkup(
    React.createElement(ProjectSettingsPage, {
      app: {
        creatorNavItems: [],
        bootstrap: { projects: [project], selectedProject: project, userName: "Creator" },
        creatorSessionControls: null,
        creatorPage: "settings",
        pageCopy: {
          eyebrow: "Project Settings",
          title: "Project Settings",
          description: "Manage project information and permanent deletion."
        },
        selectedProject: project,
        creatorPageActions: null,
        isCreateProjectDialogOpen: false,
        setIsCreateProjectDialogOpen() {},
        handleCreateProjectSubmit() {},
        isCreatingProject: false,
        createProjectForm: {},
        handleCreateProjectField() {},
        createProjectMessage: "",
        isEnteringWorkspace: false,
        handleSelectProject() {},
        handleProjectDeleted() {},
        onNavigate() {},
        pathname: "/creator/projects/payroll/settings"
      }
    })
  );

  assert.match(html, /Project information/);
  assert.match(html, /creator-danger-zone/);
  assert.match(html, /bg-danger-strong text-on-primary/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("project deletion confirmation is English and preserves failure details", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProjectDeletionConfirmation, {
      projectName: "Payroll",
      deletion: {
        confirmation: "Payroll",
        setConfirmation() {},
        isDeleting: false,
        errorMessage: "Project deletion did not finish. Some project resources may already have been removed. Retry to complete deletion.",
        errorTechnicalDetails: "Database cleanup timed out"
      }
    })
  );

  assert.match(html, /Type <strong>Payroll<\/strong> to confirm/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Project deletion did not finish\. Some project resources may already have been removed\. Retry to complete deletion\./);
  assert.match(html, /Technical details/);
  assert.match(html, /Database cleanup timed out/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("project deletion failure keeps the project and exposes raw API details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: { code: "cleanup_timeout", message: "Database cleanup timed out" }
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );

  let deletion;
  let renderer;
  let deletedCount = 0;
  function Probe() {
    deletion = useProjectDeletion({
      projectId: "payroll",
      projectName: "Payroll",
      onDeleted() {
        deletedCount += 1;
      }
    });
    return null;
  }

  try {
    await act(async () => {
      renderer = create(React.createElement(Probe));
    });
    await act(async () => deletion.setConfirmation("Payroll"));
    await act(async () => deletion.deleteProject());

    assert.equal(
      deletion.errorMessage,
      "Project deletion did not finish. Some project resources may already have been removed. Retry to complete deletion."
    );
    assert.equal(deletion.errorTechnicalDetails, "Database cleanup timed out");
    assert.equal(deletedCount, 0);
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.fetch = originalFetch;
  }
});
