import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { creatorPageCopy, creatorRouteFromPath } =
  await import("../../apps/creator-web/src/app/routes.ts");
const { CreatorRoutes } = await import("../../apps/creator-web/src/routes/CreatorRoutes.tsx");

test("Project route renders the English dashboard instead of the default fallback", () => {
  const selectedProject = {
    id: "project-1",
    name: "Project One",
    appType: "Workflow",
    status: "active",
    owner: "Creator",
    prdVersion: "v3",
    frontendVersion: "v7",
    tokenUsedThisMonth: 0,
    createdAt: "2026-01-02T00:00:00.000Z"
  };
  const creatorRoute = creatorRouteFromPath("/creator/projects/project-1/project");
  const html = renderToStaticMarkup(
    React.createElement(CreatorRoutes, {
      app: {
        bootstrap: {
          status: "ready",
          projects: [selectedProject],
          selectedProject,
          userName: "Creator"
        },
        creatorRoute,
        creatorPage: creatorRoute.page,
        requestedProjectUnavailable: false,
        creatorNavItems: [],
        creatorSessionControls: null,
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
        pathname: "/creator/projects/project-1/project"
      }
    })
  );

  assert.match(html, /Key project information and shortcuts for managing this project\./);
  assert.match(html, /Project information/);
  assert.match(html, /Jan 2, 2026/);
  assert.doesNotMatch(html, /This route has no dashboard fallback/);
});
