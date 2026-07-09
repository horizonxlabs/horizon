import { DataTable, DecisionPanel, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, ClipboardCheck, ShieldAlert, Store, UserPlus, Users } from "lucide-react";
import type { useCreatorApp } from "../../hooks/use-creator-app";

export function DefaultUsersPublishSection({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    handleInviteUser,
    isInvitingUser,
    visibleAppMembers,
    visiblePendingInvites,
    visibleAccessRequests,
    visibleRegistryEntry,
    publishReview,
    publishResult,
    publishMessage,
    handleApproveAccessRequest,
    isApprovingAccess,
    visibleAppRoles,
    handlePublishProject,
    isPublishingProject,
    visiblePublishChecklist,
    visibleDeployment
  } = app;
  return (
    <section className="sprint6-shell" aria-label="App users roles and publish">
      <div className="sprint6-main-panel">
        <SectionCard
          eyebrow="App Users"
          title="App Users: Leave Management"
          action={
            <button type="button" onClick={handleInviteUser} disabled={isInvitingUser}>
              <UserPlus size={15} /> {isInvitingUser ? "กำลังเชิญ" : "เชิญผู้ใช้"}
            </button>
          }
        >
          <div className="sprint6-status-grid">
            <div>
              <Users size={18} />
              <span>Members</span>
              <strong>
                {visibleAppMembers.filter((member) => member.status === "active").length} active
              </strong>
            </div>
            <div>
              <UserPlus size={18} />
              <span>Pending Invites</span>
              <strong>
                {
                  visiblePendingInvites.filter(
                    (invite) => invite.status === "pending" || invite.status === "approval_required"
                  ).length
                }{" "}
                waiting
              </strong>
            </div>
            <div>
              <ShieldAlert size={18} />
              <span>Access Requests</span>
              <strong>
                {visibleAccessRequests.filter((request) => request.status === "pending").length}{" "}
                pending
              </strong>
            </div>
            <div>
              <Store size={18} />
              <span>App Store registry</span>
              <strong>
                {visibleRegistryEntry ? "published" : publishReview?.ready ? "ready" : "checking"}
              </strong>
            </div>
          </div>
          <div className="workspace-action-evidence" aria-label="Publish action evidence">
            <strong>{publishResult ? "Publish evidence" : "App management evidence"}</strong>
            <span>{publishMessage}</span>
            <ToneBadge tone={publishResult ? "success" : publishReview?.ready ? "info" : "neutral"}>
              {publishResult?.deployment.status ?? (publishReview?.ready ? "ready" : "local")}
            </ToneBadge>
          </div>

          <div className="sprint6-tabs" aria-label="App user management tabs">
            {["Members", "Pending Invites", "Access Requests", "Roles"].map((tab) => (
              <button type="button" className={tab === "Members" ? "" : "ghost-button"} key={tab}>
                {tab}
              </button>
            ))}
          </div>

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

        <section className="sprint6-subgrid">
          <SectionCard eyebrow="Pending Invites" title="Invitation Queue">
            <DataTable
              columns={[
                { key: "email", label: "Email/User" },
                { key: "role", label: "Role" },
                { key: "invitedBy", label: "Invited By" },
                { key: "expires", label: "Expires" },
                {
                  key: "status",
                  label: "Status",
                  tone: (value) => (value === "approval_required" ? "warning" : "info")
                }
              ]}
              rows={visiblePendingInvites}
            />
            <DecisionPanel
              tone="warning"
              badge="Policy"
              title="External invite requires approval"
              lines={[
                "External users remain approval_required until policy review passes",
                "Invite and policy decision are audited"
              ]}
            />
          </SectionCard>

          <SectionCard eyebrow="Access Requests" title="Request Review">
            <DataTable
              columns={[
                { key: "requester", label: "Requester" },
                { key: "role", label: "Requested Role" },
                { key: "reason", label: "Reason" },
                { key: "submitted", label: "Submitted" },
                { key: "status", label: "Status", tone: () => "warning" }
              ]}
              rows={visibleAccessRequests}
            />
            <div className="creator-ticket-actions">
              <button
                type="button"
                onClick={handleApproveAccessRequest}
                disabled={
                  isApprovingAccess ||
                  !visibleAccessRequests.some((request) => request.status === "pending")
                }
              >
                {isApprovingAccess ? "Approving" : "Approve Pending Request"}
              </button>
            </div>
          </SectionCard>
        </section>

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

      <aside className="sprint6-side-panel">
        <SectionCard
          eyebrow="Publish Review"
          title="Manifest + Readiness checklist"
          action={
            <button
              type="button"
              onClick={handlePublishProject}
              disabled={isPublishingProject || publishReview?.ready === false}
            >
              <Store size={15} /> {isPublishingProject ? "Publishing" : "Publish to App Store"}
            </button>
          }
        >
          <DefinitionGrid
            items={[
              {
                label: "Manifest",
                value: `manifest v${publishReview?.manifest.manifestVersion ?? publishResult?.manifest.manifestVersion ?? "1"}`
              },
              {
                label: "Route",
                value:
                  publishReview?.manifest.app?.route ??
                  publishResult?.manifest.app?.route ??
                  `/apps/${selectedProject.id}`
              },
              { label: "Auth", value: publishReview?.manifest.auth?.mode ?? "platform_auth_sdk" },
              {
                label: "Frontend",
                value: publishReview?.manifest.frontend?.checkpointId ?? app.visiblePreview.version
              },
              {
                label: "PRD",
                value: publishReview?.manifest.prd?.version
                  ? `Baseline v${publishReview.manifest.prd.version}`
                  : "Baseline v1.0"
              },
              { label: "Visibility", value: visibleRegistryEntry?.visibility ?? "restricted" }
            ]}
          />
          <div className="publish-checklist">
            {visiblePublishChecklist.map((item) => (
              <div key={item.check}>
                <ClipboardCheck size={16} />
                <strong>{item.check}</strong>
                <span>{item.detail}</span>
                <ToneBadge tone={item.state === "pass" ? "success" : "danger"}>
                  {item.state}
                </ToneBadge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Deployment Record" title="Published Output">
          <div className="deployment-record">
            <CheckCircle2 size={20} />
            <div>
              <strong>{visibleDeployment?.id ?? "dep_leave_management_001"}</strong>
              <span>
                {visibleDeployment?.status ?? "published"} · manifest v
                {visibleDeployment?.manifestVersion ??
                  publishResult?.manifest.manifestVersion ??
                  "1"}{" "}
                · {visibleRegistryEntry ? "App Store registry visible" : "registry pending"}
              </span>
            </div>
          </div>
          <DecisionPanel
            tone="success"
            badge="Ready"
            title="Sprint 7 can consume registry and access state"
            lines={[
              "Registry entry contains slug, route, roles and visibility",
              "Deployment links PRD and frontend checkpoint"
            ]}
          />
        </SectionCard>
      </aside>
    </section>
  );
}
