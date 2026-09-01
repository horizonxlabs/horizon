import { Button, DataTable, Drawer, SectionCard } from "@evcp/ui";
import { UserPlus } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import { InviteUserForm, useInvitationDrawer } from "./invitation-drawer";

export { InviteUserForm, useInvitationDrawer } from "./invitation-drawer";

function formatPermission(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PermissionList({ value }: { value: string }) {
  const permissions = value
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);

  return (
    <span className="creator-permission-list">
      {permissions.map((permission) => (
        <span className="creator-permission-chip" key={permission}>
          {formatPermission(permission)}
        </span>
      ))}
    </span>
  );
}

export function UsersPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    handleInviteUser,
    handleAccessRequestDecision,
    decidingAccessRequestIds,
    isInvitingUser,
    publishMessage,
    publishMessageTone,
    publishMessageTechnicalDetails,
    accessLoadState,
    refreshCreatorPublishState,
    visibleAppMembers,
    visiblePendingInvites,
    visibleAccessRequests,
    visibleAppRoles
  } = app;
  const {
    isInviteOpen,
    invitation,
    inviteTriggerRef,
    emailInputRef,
    handleInvitationField,
    openInvitation,
    closeInvitation,
    submitInvitation
  } = useInvitationDrawer({ handleInviteUser, isInvitingUser });
  const resolvedAccessLoadState = accessLoadState ?? "ready";

  return (
    <>
      <CreatorShell
        app={app}
        content={
          <section className="admin-page-stack creator-access-stack" aria-label="App users roles">
            <div className="creator-access-page">
              {resolvedAccessLoadState === "loading" ? (
                <CreatorState
                  kind="loading"
                  title="Loading access information"
                  description="Retrieving the latest members, invitations, requests, and roles."
                />
              ) : resolvedAccessLoadState === "unavailable" ? (
                <CreatorState
                  kind="unavailable"
                  title="Access information is unavailable"
                  description="Retry to view the latest members, invitations, requests, and roles."
                  technicalDetails={publishMessageTechnicalDetails}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void refreshCreatorPublishState(selectedProject.id).catch(() => undefined);
                      }}
                    >
                      Retry
                    </Button>
                  }
                />
              ) : (
                <>
                  <CreatorStatusMessage
                    tone={
                      /failed|blocked/i.test(publishMessage)
                        ? "danger"
                        : (publishMessageTone ??
                          (/unavailable/i.test(publishMessage) ? "danger" : "info"))
                    }
                    technicalDetails={publishMessageTechnicalDetails}
                  >
                    {publishMessage}
                  </CreatorStatusMessage>
                  <SectionCard
                    eyebrow="App Users"
                    title={`App Users: ${selectedProject.name}`}
                    action={
                      <Button
                        ref={inviteTriggerRef}
                        type="button"
                        size="sm"
                        onClick={openInvitation}
                      >
                        <UserPlus size={15} aria-hidden="true" /> Invite user
                      </Button>
                    }
                  >
                    <DataTable
                      columns={[
                        { key: "user", label: "User" },
                        { key: "type", label: "Type" },
                        { key: "role", label: "App Role" },
                        {
                          key: "status",
                          label: "Status",
                          tone: (value) => (value === "active" ? "success" : "warning")
                        },
                        { key: "lastAccess", label: "Last Access" }
                      ]}
                      rows={visibleAppMembers}
                      ariaLabel="Project members"
                      emptyMessage="No members have access yet."
                    />
                  </SectionCard>
                  <SectionCard eyebrow="Invitations" title="Pending Invitations">
                    <DataTable
                      columns={[
                        { key: "email", label: "Email" },
                        { key: "type", label: "User Type" },
                        { key: "role", label: "App Role" },
                        { key: "invitedBy", label: "Invited By" },
                        { key: "expires", label: "Expires" },
                        {
                          key: "status",
                          label: "Status",
                          tone: (value) => (value === "accepted" ? "success" : "warning")
                        }
                      ]}
                      rows={visiblePendingInvites}
                      rowKey={(invite, index) => `${invite.email}-${invite.status}-${index}`}
                      ariaLabel="Pending invitations"
                      emptyMessage="No invitations are pending."
                    />
                  </SectionCard>
                  <SectionCard eyebrow="Access Requests" title="Request Review">
                    <DataTable
                      columns={[
                        { key: "requester", label: "Requester" },
                        { key: "role", label: "Requested Role" },
                        { key: "reason", label: "Reason" },
                        { key: "submitted", label: "Submitted" },
                        {
                          key: "status",
                          label: "Status",
                          tone: (value) =>
                            value === "approved"
                              ? "success"
                              : value === "rejected"
                                ? "danger"
                                : "warning"
                        },
                        { key: "actions", label: "Actions" }
                      ]}
                      rows={visibleAccessRequests.map((request) => {
                        const isPending = request.status === "pending";
                        const isDeciding = decidingAccessRequestIds.has(request.id);
                        return {
                          ...request,
                          actions: (
                            <div className="creator-access-actions flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="max-md:min-h-11"
                                disabled={!isPending || isDeciding}
                                onClick={() => handleAccessRequestDecision(request.id, "approved")}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="dangerOutline"
                                disabled={!isPending || isDeciding}
                                onClick={() => handleAccessRequestDecision(request.id, "rejected")}
                              >
                                Reject
                              </Button>
                            </div>
                          )
                        };
                      })}
                      rowKey={(request) => request.id}
                      ariaLabel="Access requests"
                      emptyMessage="No access requests are waiting for review."
                    />
                  </SectionCard>
                  <SectionCard eyebrow="App Roles" title="Role Permission Matrix">
                    <DataTable
                      columns={[
                        { key: "role", label: "Role" },
                        { key: "permissions", label: "Permissions" },
                        { key: "members", label: "Members" },
                        {
                          key: "status",
                          label: "Status",
                          tone: (value) => (value === "active" ? "success" : "info")
                        }
                      ]}
                      rows={visibleAppRoles.map((role) => ({
                        ...role,
                        permissions: <PermissionList value={String(role.permissions)} />
                      }))}
                      ariaLabel="Application roles"
                      emptyMessage="No application roles are available."
                    />
                  </SectionCard>
                </>
              )}
            </div>
          </section>
        }
      />
      <Drawer
        open={isInviteOpen}
        onClose={closeInvitation}
        returnFocusRef={inviteTriggerRef}
        initialFocusRef={emailInputRef}
        title="Invite user"
        description={`Add a user to ${selectedProject.name}. PRD baseline is not required.`}
      >
        <InviteUserForm
          value={invitation}
          onChange={handleInvitationField}
          onSubmit={submitInvitation}
          onCancel={closeInvitation}
          isSubmitting={isInvitingUser}
          emailInputRef={emailInputRef}
        />
      </Drawer>
    </>
  );
}
