import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;
globalThis.window = {
  location: { pathname: "/creator/projects/project-1/users" },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { UsersPage } = await import("../../apps/creator-web/src/features/users/UsersPage.tsx");

const project = {
  id: "project-1",
  name: "Project One",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-1",
  tokenUsedThisMonth: 0
};

function createApp(handleAccessRequestDecision, overrides = {}) {
  return {
    selectedProject: project,
    handleInviteUser: async () => true,
    handleAccessRequestDecision,
    decidingAccessRequestIds: new Set(),
    isInvitingUser: false,
    publishMessage: "Access information is up to date.",
    publishMessageTone: "success",
    publishMessageTechnicalDetails: undefined,
    accessLoadState: "ready",
    refreshCreatorPublishState: async () => undefined,
    visibleAppMembers: [],
    visiblePendingInvites: [],
    visibleAccessRequests: [
      {
        id: "request-selected",
        requester: "selected@company.com",
        role: "manager",
        reason: "Approve invoices",
        submitted: "2026-08-17",
        status: "pending"
      }
    ],
    visibleAppRoles: [],
    creatorNavItems: [],
    bootstrap: { userName: "Creator User", projects: [project] },
    creatorSessionControls: null,
    creatorPage: "users",
    pageCopy: { title: "Users & Roles", description: "Manage access." },
    creatorPageActions: undefined,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen() {},
    handleCreateProjectSubmit() {},
    createProjectForm: {},
    handleCreateProjectField() {},
    createProjectMessage: "",
    isCreatingProject: false,
    isEnteringWorkspace: false,
    handleSelectProject() {},
    onNavigate() {},
    pathname: "/creator/projects/project-1/users",
    ...overrides
  };
}

test("rendered access actions send the selected request and decision", async () => {
  const decisions = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(UsersPage, {
        app: createApp((requestId, decision) => decisions.push([requestId, decision]))
      })
    );
  });

  const decisionButtons = renderer.root.findAll(
    (node) =>
      node.type === "button" &&
      (node.children.includes("Approve") || node.children.includes("Reject"))
  );
  await act(async () => decisionButtons[0].props.onClick());
  await act(async () => decisionButtons[1].props.onClick());

  assert.deepEqual(decisions, [
    ["request-selected", "approved"],
    ["request-selected", "rejected"]
  ]);
  await act(async () => renderer.unmount());
});

test("the unavailable access state retries the selected project", async () => {
  const retries = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(UsersPage, {
        app: createApp(() => undefined, {
          accessLoadState: "unavailable",
          publishMessageTechnicalDetails: "access service offline",
          async refreshCreatorPublishState(projectId) {
            retries.push(projectId);
          }
        })
      })
    );
  });

  const retry = renderer.root.find(
    (node) => node.type === "button" && node.children.includes("Retry")
  );
  await act(async () => retry.props.onClick());

  assert.deepEqual(retries, ["project-1"]);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});
