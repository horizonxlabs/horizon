import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";

globalThis.React = React;

const { VersionsPage } =
  await import("../../apps/creator-web/src/features/versions/VersionsPage.tsx");
const { DeploymentsPage } =
  await import("../../apps/creator-web/src/features/deployments/DeploymentsPage.tsx");
const { TicketsPage } = await import("../../apps/creator-web/src/features/tickets/TicketsPage.tsx");
const { TicketDetailPage } =
  await import("../../apps/creator-web/src/features/tickets/TicketDetailPage.tsx");
const { creatorPageCopy } = await import("../../apps/creator-web/src/app/routes.ts");
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

const project = {
  id: "operations hub",
  name: "Operations Hub",
  appType: "Workflow",
  status: "in_review",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-0002",
  createdAt: "2026-08-24T00:00:00.000Z"
};

const currentCheckpoint = {
  id: "checkpoint-2",
  projectId: project.id,
  version: "fe-0002",
  sourcePreviewVersion: "preview-2",
  status: "current",
  checksum: "sha256:2",
  fileManifest: ["src/App.tsx"],
  routeSnapshot: ["/"],
  changeSummary: "Current UI",
  changedAreas: ["Dashboard"],
  createdByUserId: "creator-1",
  createdAt: "2026-08-24T12:00:00.000Z"
};
const previousCheckpoint = {
  ...currentCheckpoint,
  id: "checkpoint-1",
  version: "fe-0001",
  status: "previous",
  changeSummary: "Initial UI",
  createdAt: "2026-08-23T12:00:00.000Z"
};
const timeline = {
  project: { id: project.id, name: project.name },
  activeCheckpoint: currentCheckpoint,
  checkpoints: [currentCheckpoint, previousCheckpoint]
};

function appFor(page, overrides = {}) {
  return {
    creatorNavItems: [],
    bootstrap: { projects: [project], userName: "Creator", status: "ready" },
    creatorSessionControls: null,
    creatorPage: page,
    creatorRoute: { page, projectId: project.id },
    pageCopy: creatorPageCopy[page === "ticket-detail" ? "tickets" : page],
    selectedProject: project,
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
    pathname: `/creator/projects/${encodeURIComponent(project.id)}/${page}`,
    refreshPrdState: async () => undefined,
    ...overrides
  };
}

async function withRenderedPage(Page, { app, client }, verify) {
  const originalWindow = globalThis.window;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = {
    location: { pathname: app.pathname, search: "", hash: "", href: "http://localhost", port: "" },
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {}
  };
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(Page, { app, client }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await verify(renderer, () => JSON.stringify(renderer.toJSON()));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
}

test("Versions renders one loading state while checkpoints are pending", async () => {
  await withRenderedPage(
    VersionsPage,
    { app: appFor("versions"), client: { getFrontendCheckpoints: () => new Promise(() => {}) } },
    async (renderer, json) => {
      assert.match(json(), /creator-state-loading/);
      assert.match(json(), /Loading checkpoints/);
      assert.doesNotMatch(json(), /Loading frontend checkpoints from Platform API/);
      assert.equal(renderer.root.findAll((node) => node.props.role === "status").length, 1);
    }
  );
});

test("Versions renders one actionable unavailable state with technical details", async () => {
  await withRenderedPage(
    VersionsPage,
    {
      app: appFor("versions"),
      client: {
        getFrontendCheckpoints: async () => {
          throw new Error("checkpoint API offline");
        }
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-unavailable/);
      assert.match(json(), /Checkpoints could not be loaded/);
      assert.match(json(), /Existing frontend versions are unchanged/);
      assert.match(json(), /Retry/);
      assert.match(json(), /Technical details/);
      assert.match(json(), /checkpoint API offline/);
      assert.equal((json().match(/Checkpoints could not be loaded/g) ?? []).length, 1);
      assert.doesNotMatch(json(), /Frontend history is unavailable/);
    }
  );
});

test("Versions labels current and restorable checkpoints with English dates", async () => {
  await withRenderedPage(
    VersionsPage,
    {
      app: appFor("versions"),
      client: {
        getFrontendCheckpoints: async () => timeline,
        restoreFrontendCheckpoint: async () => ({
          checkpoint: currentCheckpoint,
          restoredFrom: previousCheckpoint,
          boundary: { frontendChanged: true, unchanged: [] },
          auditEventId: "audit-1"
        })
      }
    },
    async (renderer, json) => {
      assert.match(json(), /Current/);
      assert.match(json(), /Available/);
      assert.match(json(), /Aug 24, 2026/);
      assert.match(json(), /Aug 23, 2026/);
      const buttons = renderer.root.findAll(
        (node) => node.type === "button" && node.children.includes("Restore")
      );
      assert.equal(buttons.length, 2);
      assert.equal(buttons[0].props.disabled, true);
      assert.equal(buttons[1].props.disabled, false);
    }
  );
});

test("Versions renders a healthy empty state for an empty checkpoint timeline", async () => {
  await withRenderedPage(
    VersionsPage,
    {
      app: appFor("versions"),
      client: {
        getFrontendCheckpoints: async () => ({
          ...timeline,
          activeCheckpoint: undefined,
          checkpoints: []
        })
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-empty/);
      assert.match(json(), /No checkpoints yet/);
      assert.doesNotMatch(json(), /creator-ticket-list/);
    }
  );
});

test("Versions preserves a failed restore as its own retryable outcome", async () => {
  let restoreCalls = 0;
  await withRenderedPage(
    VersionsPage,
    {
      app: appFor("versions"),
      client: {
        getFrontendCheckpoints: async () => timeline,
        restoreFrontendCheckpoint: async () => {
          restoreCalls += 1;
          throw new Error("restore policy rejected");
        }
      }
    },
    async (renderer, json) => {
      const restore = renderer.root.findAll(
        (node) => node.type === "button" && node.children.includes("Restore")
      )[1];
      await act(async () => restore.props.onClick());
      assert.match(json(), /creator-status-message-danger/);
      assert.match(json(), /Checkpoint could not be restored/);
      assert.match(json(), /Existing frontend versions are unchanged/);
      assert.match(json(), /restore policy rejected/);
      assert.match(json(), /Current UI/);
      assert.match(json(), /Initial UI/);
      assert.doesNotMatch(json(), /Checkpoints could not be loaded/);
      const retry = renderer.root.find(
        (node) => node.type === "button" && node.children.includes("Retry restore")
      );
      await act(async () => retry.props.onClick());
      assert.equal(restoreCalls, 2);
    }
  );
});

test("Deployments renders one empty state that navigates to Publish", async () => {
  const navigations = [];
  await withRenderedPage(
    DeploymentsPage,
    {
      app: appFor("deployments", { onNavigate: (path) => navigations.push(path) }),
      client: { listDeployments: async () => [] }
    },
    async (renderer, json) => {
      assert.match(json(), /creator-state-empty/);
      assert.match(json(), /No deployments yet/);
      assert.equal((json().match(/No deployments yet/g) ?? []).length, 1);
      assert.doesNotMatch(json(), /No deployment evidence available/);
      const publish = renderer.root.find(
        (node) => node.type === "button" && node.children.includes("Go to Publish")
      );
      await act(async () => publish.props.onClick());
      assert.deepEqual(navigations, ["/creator/projects/operations%20hub/publish"]);
    }
  );
});

test("Deployments renders one retryable unavailable state", async () => {
  await withRenderedPage(
    DeploymentsPage,
    {
      app: appFor("deployments"),
      client: {
        listDeployments: async () => {
          throw new Error("deployments offline");
        }
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-unavailable/);
      assert.match(json(), /Deployments could not be loaded/);
      assert.match(json(), /Retry/);
      assert.match(json(), /deployments offline/);
      assert.doesNotMatch(json(), /No deployments yet/);
    }
  );
});

test("Deployments renders readable populated deployment evidence", async () => {
  await withRenderedPage(
    DeploymentsPage,
    {
      app: appFor("deployments"),
      client: {
        listDeployments: async () => [
          {
            id: "deployment-1",
            projectId: project.id,
            slug: "operations-hub",
            environment: "production",
            commitSha: "abc123def",
            imageTag: "operations-hub:2026.08.24",
            containerId: "container-1",
            publishedByUserId: "creator-1",
            healthStatus: "healthy",
            createdAt: "2026-08-24T12:30:00.000Z"
          }
        ]
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /Version \/ Image/);
      assert.match(json(), /operations-hub:2026\.08\.24/);
      assert.match(json(), /Production/);
      assert.match(json(), /Healthy/);
      assert.match(json(), /Aug 24, 2026/);
      assert.doesNotMatch(json(), /2026-08-24T12:30:00\.000Z/);
    }
  );
});

test("Tickets distinguishes a healthy empty inbox from service unavailability", async () => {
  await withRenderedPage(
    TicketsPage,
    { app: appFor("tickets"), client: { request: async () => [] } },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-empty/);
      assert.match(json(), /No tickets yet/);
      assert.doesNotMatch(json(), /Ticket service is unavailable/);
    }
  );
  await withRenderedPage(
    TicketsPage,
    {
      app: appFor("tickets"),
      client: {
        request: async () => {
          throw new Error("ticket API offline");
        }
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-unavailable/);
      assert.match(json(), /Ticket service is unavailable/);
      assert.match(json(), /Retry/);
      assert.match(json(), /ticket API offline/);
      assert.doesNotMatch(json(), /No tickets yet/);
    }
  );
});

test("Ticket detail renders retryable service unavailability without duplicate copy", async () => {
  await withRenderedPage(
    TicketDetailPage,
    {
      app: appFor("ticket-detail", {
        creatorRoute: { page: "ticket-detail", projectId: project.id, ticketId: "ticket-1" }
      }),
      client: {
        request: async () => {
          throw new Error("detail offline");
        }
      }
    },
    async (_renderer, json) => {
      assert.match(json(), /creator-state-unavailable/);
      assert.match(json(), /Ticket detail is unavailable/);
      assert.match(json(), /Retry/);
      assert.match(json(), /detail offline/);
      assert.doesNotMatch(json(), /Ticket inbox is unavailable/);
    }
  );
});
