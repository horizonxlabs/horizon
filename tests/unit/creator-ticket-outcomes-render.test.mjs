import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";

globalThis.React = React;

const { TicketDetailPage } =
  await import("../../apps/creator-web/src/features/tickets/TicketDetailPage.tsx");
const { TicketsPage } = await import("../../apps/creator-web/src/features/tickets/TicketsPage.tsx");
const { createTicketPrdChangeAction } =
  await import("../../apps/creator-web/src/features/tickets/ticket-actions.ts");
const { creatorPageCopy } = await import("../../apps/creator-web/src/app/routes.ts");
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

const project = {
  id: "operations-hub",
  name: "Operations Hub",
  owner: "Creator",
  status: "in_review",
  createdAt: "2026-08-24T00:00:00.000Z"
};

function ticketFor(id) {
  return {
    id,
    ticketNumber: "TKT-0042",
    appName: "Operations Hub",
    title: "Approval step is missing",
    submittedByEmail: "user@company.com",
    type: "bug_report",
    priority: "high",
    status: "in_progress",
    description: "The approval step does not appear.",
    deviceInfo: "Chrome on macOS",
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    timeline: [],
    actions: ["convert_to_prd_change"]
  };
}

function appFor(page, ticketId) {
  return {
    creatorNavItems: [],
    bootstrap: { projects: [project], userName: "Creator", status: "ready" },
    creatorSessionControls: null,
    creatorPage: page,
    creatorRoute: { page, projectId: project.id, ticketId },
    pageCopy: creatorPageCopy.tickets,
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
    pathname: `/creator/projects/${project.id}/tickets${ticketId ? `/${ticketId}` : ""}`,
    refreshPrdState: async () => undefined
  };
}

async function withRenderedTicketPage(Page, ticket, verify) {
  const originalWindow = globalThis.window;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = {
    location: { pathname: "/creator", search: "", hash: "", href: "http://localhost", port: "" },
    history: { pushState() {}, replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {}
  };
  let renderer;
  try {
    const page = Page === TicketDetailPage ? "ticket-detail" : "tickets";
    await act(async () => {
      renderer = create(
        React.createElement(Page, {
          app: appFor(page, page === "ticket-detail" ? ticket.id : undefined),
          client: { request: async () => [ticket] }
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await verify(() => JSON.stringify(renderer.toJSON()));
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
}

function actionFor(ticket, { convert, refreshInbox = async () => undefined }) {
  return createTicketPrdChangeAction({
    projectId: project.id,
    ticket,
    client: { convertTicketToPrdChange: convert },
    refreshInbox,
    refreshPrdState: async () => undefined
  });
}

test("Ticket detail renders a pending conversion with neutral progress semantics", async () => {
  const ticket = ticketFor("ticket-pending");
  let resolvePost;
  const action = actionFor(ticket, {
    convert: async () =>
      new Promise((resolve) => {
        resolvePost = resolve;
      })
  });
  const request = action.run();
  await withRenderedTicketPage(TicketDetailPage, ticket, async (json) => {
    assert.match(json(), /creator-status-message-info/);
    assert.match(json(), /Creating PRD change/);
    assert.doesNotMatch(json(), /creator-status-message-success/);
  });
  resolvePost();
  await request;
});

test("Ticket detail renders partial conversion success as a warning", async () => {
  const ticket = ticketFor("ticket-partial");
  const action = actionFor(ticket, {
    convert: async () => undefined,
    refreshInbox: async () => {
      throw new Error("ticket refresh offline");
    }
  });
  await action.run();
  await withRenderedTicketPage(TicketDetailPage, ticket, async (json) => {
    assert.match(json(), /creator-status-message-warning/);
    assert.match(
      json(),
      /PRD change was created, but the latest governed state could not be loaded/
    );
    assert.match(json(), /ticket refresh offline/);
    assert.doesNotMatch(json(), /PRD change could not be created/);
  });
});

test("Ticket detail renders conversion failure with danger semantics and technical details", async () => {
  const ticket = ticketFor("ticket-failure");
  const action = actionFor(ticket, {
    convert: async () => {
      throw new Error("conversion rejected");
    }
  });
  assert.deepEqual(await action.run(), {
    kind: "failure",
    message: "PRD change could not be created.",
    technicalDetails: "conversion rejected"
  });
  await withRenderedTicketPage(TicketDetailPage, ticket, async (json) => {
    assert.match(json(), /creator-status-message-danger/);
    assert.match(json(), /PRD change could not be created/);
    assert.match(json(), /Technical details/);
    assert.match(json(), /conversion rejected/);
  });
});

test("Ticket inbox and detail render readable English metadata", async () => {
  const ticket = ticketFor("ticket-formatting");
  await withRenderedTicketPage(TicketsPage, ticket, async (json) => {
    assert.match(json(), /Priority: High/);
    assert.match(json(), /In progress/);
    assert.doesNotMatch(json(), /priority high/);
  });
  await withRenderedTicketPage(TicketDetailPage, ticket, async (json) => {
    assert.match(json(), /Bug report/);
    assert.match(json(), /High/);
    assert.match(json(), /In progress/);
    assert.match(json(), /Jul 29, 2026/);
    assert.doesNotMatch(json(), /2026-07-29T12:00:00\.000Z/);
  });
});
