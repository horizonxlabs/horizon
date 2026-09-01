import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { useBrowserPath } = await import("../../packages/ui/src/browser-navigation.ts");
const { selectCreatorProjectForRequest } =
  await import("../../apps/creator-web/src/app/creator-app-helpers.ts");
const { creatorPageCopy, creatorRouteFromPath } =
  await import("../../apps/creator-web/src/app/routes.ts");
const { CreatorRoutes } = await import("../../apps/creator-web/src/routes/CreatorRoutes.tsx");

const olderProject = {
  id: "older-project",
  name: "Older Project",
  appType: "Workflow App",
  status: "draft",
  owner: "Creator",
  prdVersion: "Not started",
  frontendVersion: "Not started",
  tokenUsedThisMonth: 0,
  createdAt: "2026-08-20T00:00:00.000Z"
};

const latestProject = {
  ...olderProject,
  id: "latest/project #1",
  name: "Latest Project",
  createdAt: "2026-08-25T00:00:00.000Z"
};

function appForRoot(projects) {
  const selectedProject = selectCreatorProjectForRequest(projects);
  return {
    bootstrap: {
      status: projects.length ? "ready" : "empty",
      projects,
      selectedProject,
      userName: "Creator",
      source: "Platform API"
    },
    selectedProject,
    creatorPage: "projects",
    creatorRoute: { page: "projects" },
    requestedProjectUnavailable: false,
    creatorNavItems: [],
    creatorSessionControls: null,
    creatorPageActions: null,
    pageCopy: creatorPageCopy.projects,
    pathname: "/creator/",
    onNavigate() {},
    handleSelectProject: async () => undefined,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen() {},
    handleCreateProjectSubmit() {},
    isCreatingProject: false,
    createProjectForm: {},
    handleCreateProjectField() {},
    createProjectMessage: "",
    createProjectTechnicalDetails: undefined,
    isEnteringWorkspace: false
  };
}

function browserFor(pathname, navigations) {
  const listeners = new Map();
  const location = { pathname };
  return {
    location,
    history: {
      replaceState(_state, _unused, path) {
        navigations.push(path);
        location.pathname = path;
      },
      pushState() {
        assert.fail("Unexpected push navigation");
      }
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    }
  };
}

function RoutedCreator({ app }) {
  const pathname = useBrowserPath();
  const creatorRoute = creatorRouteFromPath(pathname);
  const selectedProject =
    app.bootstrap.projects.find((project) => project.id === creatorRoute.projectId) ??
    app.selectedProject;
  return React.createElement(CreatorRoutes, {
    app: {
      ...app,
      pathname,
      creatorRoute,
      creatorPage: creatorRoute.page,
      pageCopy: creatorPageCopy[creatorRoute.page],
      selectedProject
    }
  });
}

async function renderRoute(app) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(CreatorRoutes, { app }));
    await Promise.resolve();
  });
  return renderer;
}

test("Creator root replaces the URL with the newest project's encoded dashboard route", async () => {
  const originalWindow = globalThis.window;
  const navigations = [];
  globalThis.window = browserFor("/creator/", navigations);

  const readyApp = appForRoot([latestProject, olderProject]);
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(RoutedCreator, {
        app: { ...readyApp, bootstrap: { ...readyApp.bootstrap, status: "loading" } }
      })
    );
  });
  await act(async () => {
    renderer.update(React.createElement(RoutedCreator, { app: readyApp }));
    await Promise.resolve();
  });
  assert.deepEqual(navigations, ["/creator/projects/latest%2Fproject%20%231/project"]);
  assert.equal(window.location.pathname, "/creator/projects/latest%2Fproject%20%231/project");
  const output = JSON.stringify(renderer.toJSON());
  assert.match(output, /Project: Latest Project/);
  assert.doesNotMatch(output, /Opening latest project|Recent projects|Search projects/);

  await act(async () => renderer.unmount());
  globalThis.window = originalWindow;
});

test("Creator root resolves the latest remaining project after selection was cleared", async () => {
  const originalWindow = globalThis.window;
  const navigations = [];
  globalThis.window = browserFor("/creator/", navigations);
  const app = {
    ...appForRoot([olderProject, latestProject]),
    selectedProject: { ...olderProject, id: "", name: "" }
  };

  const renderer = await renderRoute(app);
  assert.deepEqual(navigations, ["/creator/projects/latest%2Fproject%20%231/project"]);

  await act(async () => renderer.unmount());
  globalThis.window = originalWindow;
});

test("Creator root keeps a create-first empty state without the retired project catalogue", async () => {
  const originalWindow = globalThis.window;
  const navigations = [];
  globalThis.window = browserFor("/creator/", navigations);

  const renderer = await renderRoute(appForRoot([]));
  const output = JSON.stringify(renderer.toJSON());
  assert.deepEqual(navigations, []);
  assert.match(output, /Create your first project/);
  assert.match(output, /Create project/);
  assert.doesNotMatch(output, /Recent projects|Search projects|Project list/);
  assert.equal(renderer.root.findAll((node) => node.type === "h1").length, 1);

  await act(async () => renderer.unmount());
  globalThis.window = originalWindow;
});

test("Unavailable project recovery describes the latest-project outcome", async () => {
  const originalWindow = globalThis.window;
  const navigations = [];
  globalThis.window = browserFor("/creator/projects/missing-project/versions", navigations);
  const app = {
    ...appForRoot([olderProject, latestProject]),
    creatorPage: "versions",
    creatorRoute: { page: "versions", projectId: "missing-project" },
    requestedProjectUnavailable: true,
    pathname: "/creator/projects/missing-project/versions"
  };

  const renderer = await renderRoute(app);
  const recovery = renderer.root.find(
    (node) => node.type === "button" && node.children.includes("Open latest project")
  );
  assert.equal(recovery.children.join(""), "Open latest project");

  await act(async () => renderer.unmount());
  globalThis.window = originalWindow;
});

test("An explicit project dashboard URL is never replaced by root entry behavior", async () => {
  const originalWindow = globalThis.window;
  const navigations = [];
  globalThis.window = browserFor("/creator/projects/older-project/project", navigations);
  const app = {
    ...appForRoot([latestProject, olderProject]),
    selectedProject: olderProject,
    creatorPage: "project",
    creatorRoute: { page: "project", projectId: olderProject.id },
    pageCopy: creatorPageCopy.project,
    pathname: "/creator/projects/older-project/project"
  };

  const renderer = await renderRoute(app);
  assert.deepEqual(navigations, []);
  assert.match(JSON.stringify(renderer.toJSON()), /Project: Older Project/);

  await act(async () => renderer.unmount());
  globalThis.window = originalWindow;
});
