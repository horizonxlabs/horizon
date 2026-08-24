import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { UsersPage } =
  await import("../../apps/creator-web/src/features/users/UsersPage.tsx");

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

function renderUsers(overrides = {}) {
  const app = {
    selectedProject: project,
    handleInviteUser: async () => true,
    handleAccessRequestDecision() {},
    decidingAccessRequestIds: new Set(),
    isInvitingUser: false,
    publishMessage: "Access information is up to date.",
    publishMessageTone: "success",
    publishMessageTechnicalDetails: undefined,
    visibleAppMembers: [],
    visiblePendingInvites: [],
    visibleAccessRequests: [],
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
  return renderToStaticMarkup(React.createElement(UsersPage, { app }));
}

test("each access table remains keyboard reachable and explains its healthy empty state", () => {
  const html = renderUsers();

  for (const label of [
    "Project members",
    "Pending invitations",
    "Access requests",
    "Application roles"
  ]) {
    assert.match(html, new RegExp(`role="region" aria-label="${label}" tabindex="0"`));
  }
  assert.match(html, /No members have access yet\./);
  assert.match(html, /No invitations are pending\./);
  assert.match(html, /No access requests are waiting for review\./);
  assert.match(html, /No application roles are available\./);
});

test("permission identifiers are formatted for display without changing their stored values", () => {
  const html = renderUsers({
    visibleAppRoles: [
      {
        role: "Manager",
        permissions: "users.read, leave_requests-approve, reports.export",
        members: "2",
        status: "active"
      }
    ]
  });

  assert.match(html, /creator-permission-list/);
  assert.match(html, /creator-permission-chip[^>]*>Users Read</);
  assert.match(html, /creator-permission-chip[^>]*>Leave Requests Approve</);
  assert.match(html, /creator-permission-chip[^>]*>Reports Export</);
  assert.doesNotMatch(html, />users\.read</);
  assert.doesNotMatch(html, />leave_requests-approve</);
});

test("access decisions use semantic actions and disable only the request being decided", () => {
  const html = renderUsers({
    decidingAccessRequestIds: new Set(["request-pending"]),
    visibleAccessRequests: [
      {
        id: "request-pending",
        requester: "pending@company.com",
        role: "manager",
        reason: "Approve invoices",
        submitted: "2026-08-17",
        status: "pending"
      },
      {
        id: "request-ready",
        requester: "ready@company.com",
        role: "employee",
        reason: "View reports",
        submitted: "2026-08-18",
        status: "pending"
      }
    ]
  });

  const approveButtons = [...html.matchAll(/<button[^>]*>Approve<\/button>/g)].map(
    ([button]) => button
  );
  const rejectButtons = [...html.matchAll(/<button[^>]*>Reject<\/button>/g)].map(
    ([button]) => button
  );

  assert.match(html, /creator-access-actions[^>]*flex-wrap/);
  assert.equal(approveButtons.length, 2);
  assert.equal(rejectButtons.length, 2);
  assert.equal(approveButtons.filter((button) => button.includes('disabled=""')).length, 1);
  assert.equal(rejectButtons.filter((button) => button.includes('disabled=""')).length, 1);
  assert.ok(approveButtons.every((button) => button.includes("max-md:min-h-11")));
  assert.ok(rejectButtons.every((button) => button.includes("border-danger")));
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("access feedback leads with an outcome and discloses raw technical detail", () => {
  const html = renderUsers({
    publishMessage: "Access request could not be approved. No access changes were applied.",
    publishMessageTone: "danger",
    publishMessageTechnicalDetails: "approval service returned HTTP 503"
  });

  assert.match(html, /creator-status-message-danger/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Access request could not be approved\. No access changes were applied\./);
  assert.match(html, /<summary>Technical details<\/summary>/);
  assert.match(html, /approval service returned HTTP 503/);
});
