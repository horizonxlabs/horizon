import type { AppAccessSnapshotResponse } from "@evcp/api-client";

export function createAccessView(snapshot?: AppAccessSnapshotResponse) {
  return {
    visibleAppMembers:
      snapshot?.members.map((member) => ({
        user: member.name || member.email,
        type: member.userType,
        role: member.roleName,
        status: member.status,
        lastAccess: member.lastAccessAt ? member.lastAccessAt.slice(0, 10) : "pending"
      })) ?? [],
    visiblePendingInvites:
      snapshot?.invitations
        .filter((invite) => ["pending", "approval_required"].includes(invite.status))
        .map((invite) => ({
          email: invite.email,
          type: invite.userType,
          role: invite.roleKey,
          invitedBy: "Creator User",
          expires: invite.expiresAt ? invite.expiresAt.slice(0, 10) : "No expiration date",
          status: invite.status
        })) ?? [],
    visibleAccessRequests:
      snapshot?.accessRequests.map((request) => ({
        id: request.id,
        requester: request.requesterEmail,
        role: request.requestedRoleKey,
        reason: request.reason,
        submitted: request.createdAt.slice(0, 10),
        status: request.status
      })) ?? [],
    visibleAppRoles:
      snapshot?.roles.map((role) => ({
        role: role.name,
        permissions: role.permissions.join(", "),
        members: String(role.memberCount),
        status: role.memberCount > 0 ? "active" : "ready"
      })) ?? []
  };
}
