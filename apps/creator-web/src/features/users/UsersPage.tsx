import { DataTable, SectionCard } from "@evcp/ui";
import { UserPlus } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";

export function UsersPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    handleInviteUser,
    handleAccessRequestDecision,
    decidingAccessRequestId,
    isInvitingUser,
    visibleAppMembers,
    visibleAccessRequests,
    visibleAppRoles
  } = app;
  return (
    <CreatorShell
      app={app}
      content={
        <section className="sprint6-shell" aria-label="App users roles">
          <div className="sprint6-main-panel">
            <SectionCard
              eyebrow="App Users"
              title={`App Users: ${selectedProject.name}`}
              action={
                <button type="button" onClick={handleInviteUser} disabled={isInvitingUser}>
                  <UserPlus size={15} /> {isInvitingUser ? "กำลังเชิญ" : "เชิญผู้ใช้"}
                </button>
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
                      value === "approved" ? "success" : value === "rejected" ? "danger" : "warning"
                  },
                  { key: "actions", label: "Actions" }
                ]}
                rows={visibleAccessRequests.map((request) => {
                  const isPending = request.status === "pending";
                  const isDeciding = decidingAccessRequestId === request.id;
                  return {
                    ...request,
                    actions: (
                      <div className="actions">
                        <button type="button" disabled={!isPending || isDeciding} onClick={() => handleAccessRequestDecision(request.id, "approved")}>Approve</button>
                        <button type="button" disabled={!isPending || isDeciding} onClick={() => handleAccessRequestDecision(request.id, "rejected")}>Reject</button>
                      </div>
                    )
                  };
                })}
                rowKey={(request) => request.id}
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
                rows={visibleAppRoles}
              />
            </SectionCard>
          </div>
        </section>
      }
    />
  );
}
