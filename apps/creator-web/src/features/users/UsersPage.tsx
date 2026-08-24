import type { AppInvitationInput } from "@evcp/api-client";
import { Button, DataTable, Drawer, Field, Input, SectionCard, Select, Textarea } from "@evcp/ui";
import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";

const initialInvitation: AppInvitationInput = {
  email: "",
  roleKey: "employee",
  userType: "internal",
  note: ""
};

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

export function InviteUserForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting
}: {
  value: AppInvitationInput;
  onChange: (field: keyof AppInvitationInput, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  isSubmitting: boolean;
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="rounded-card border-primary/15 bg-primary-soft border px-4 py-3">
        <strong className="text-primary-strong block text-sm">
          Grant app access by invitation
        </strong>
        <p className="text-muted mt-1 text-xs">
          The invitation is independent of PRD and workspace readiness.
        </p>
      </div>

      <Field
        label="Email address"
        htmlFor="invite-user-email"
        hint="Use the address the user signs in with."
      >
        <Input
          id="invite-user-email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@company.com"
          value={value.email}
          onChange={(event) => onChange("email", event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <Field label="App role" htmlFor="invite-user-role">
          <Select
            id="invite-user-role"
            aria-label="App role"
            value={value.roleKey}
            onChange={(event) => onChange("roleKey", event.target.value)}
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
          </Select>
        </Field>
        <Field label="User type" htmlFor="invite-user-type">
          <Select
            id="invite-user-type"
            aria-label="User type"
            value={value.userType}
            onChange={(event) => onChange("userType", event.target.value)}
          >
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Note"
        htmlFor="invite-user-note"
        hint="Visible to access reviewers and project administrators."
      >
        <Textarea
          id="invite-user-note"
          placeholder="Optional context for the invitation"
          value={value.note ?? ""}
          onChange={(event) => onChange("note", event.target.value)}
        />
      </Field>

      {value.userType === "external" ? (
        <p className="rounded-control border-warning/20 bg-warning-bg text-warning border px-3 py-2 text-xs">
          External invitations require approval before access becomes active.
        </p>
      ) : null}

      <div className="border-border mt-2 flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting || !value.email.trim()}>
          <UserPlus size={16} aria-hidden="true" />
          {isSubmitting ? "Sending invitation…" : "Send invitation"}
        </Button>
      </div>
    </form>
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
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitation, setInvitation] = useState<AppInvitationInput>(initialInvitation);
  const resolvedAccessLoadState = accessLoadState ?? "ready";

  function handleInvitationField(field: keyof AppInvitationInput, nextValue: string) {
    setInvitation((current) => ({ ...current, [field]: nextValue }) as AppInvitationInput);
  }

  async function handleInvitationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await handleInviteUser(invitation);
    if (!sent) return;
    setInvitation(initialInvitation);
    setIsInviteOpen(false);
  }

  function closeInvitation() {
    if (isInvitingUser) return;
    setIsInviteOpen(false);
  }

  return (
    <>
      <CreatorShell
        app={app}
        content={
          <section className="admin-page-stack" aria-label="App users roles">
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
                      <Button type="button" size="sm" onClick={() => setIsInviteOpen(true)}>
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
        title="Invite user"
        description={`Add a user to ${selectedProject.name}. PRD baseline is not required.`}
      >
        <InviteUserForm
          value={invitation}
          onChange={handleInvitationField}
          onSubmit={handleInvitationSubmit}
          onCancel={closeInvitation}
          isSubmitting={isInvitingUser}
        />
      </Drawer>
    </>
  );
}
