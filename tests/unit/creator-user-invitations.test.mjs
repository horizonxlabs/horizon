import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select } from "../../packages/ui/src/index.tsx";

globalThis.React = React;

const usersModule = await import("../../apps/creator-web/src/features/users/UsersPage.tsx");

test("the invitation form collects email, role, user type, and note", () => {
  assert.equal(typeof usersModule.InviteUserForm, "function");
  const props = {
    value: { email: "", roleKey: "employee", userType: "internal", note: "" },
    onChange() {},
    onSubmit() {},
    isSubmitting: false
  };
  const element = usersModule.InviteUserForm(props);
  const html = renderToStaticMarkup(element);

  const selectOptions = [];
  function collectSelectOptions(node) {
    if (!React.isValidElement(node)) return;
    if (node.type === Select) {
      selectOptions.push(
        React.Children.toArray(node.props.children).map((option) => option.props.children)
      );
    }
    React.Children.forEach(node.props.children, collectSelectOptions);
  }
  collectSelectOptions(element);

  assert.match(html, /type="email"/);
  assert.deepEqual(selectOptions, [
    ["Employee", "Manager"],
    ["Internal", "External"]
  ]);
  assert.match(html, /placeholder="Optional context for the invitation"/);
  assert.match(html, />Send invitation</);
});

test("the Users page shows pending invitations from app access state", () => {
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
  const app = {
    selectedProject: project,
    handleInviteUser() {},
    handleAccessRequestDecision() {},
    decidingAccessRequestIds: new Set(),
    isInvitingUser: false,
    publishMessage: "App access loaded.",
    visibleAppMembers: [],
    visiblePendingInvites: [
      {
        email: "new.user@company.com",
        role: "employee",
        invitedBy: "Creator User",
        expires: "not set",
        status: "pending"
      }
    ],
    visibleAccessRequests: [],
    visibleAppRoles: [],
    creatorNavItems: [],
    bootstrap: { userName: "Creator User", projects: [project] },
    creatorSessionControls: null,
    creatorPage: "users",
    pageCopy: { eyebrow: "Project Access", title: "Users", description: "Manage access." },
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
    pathname: "/creator/projects/project-1/users"
  };

  const html = renderToStaticMarkup(React.createElement(usersModule.UsersPage, { app }));

  assert.match(html, />Pending Invitations</);
  assert.match(html, />new\.user@company\.com</);
  assert.match(html, />pending</);
});
