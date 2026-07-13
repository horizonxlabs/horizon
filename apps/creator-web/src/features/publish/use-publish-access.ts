import {
  type AppAccessSnapshotResponse,
  type AppStoreRegistryEntryDto,
  type PublishResultResponse,
  type PublishReviewResponse
} from "@evcp/api-client";
import { useState } from "react";
import { accessRequests, appMembers, appRoles, pendingInvites } from "@/features/users";
import { publishChecklist } from "./fixtures";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";
import { loadCreatorPublishState } from "./api";

export function usePublishAccess({
  selectedProject
}: {
  selectedProject: CreatorProjectView;
}) {
  const [appAccessSnapshot, setAppAccessSnapshot] = useState<AppAccessSnapshotResponse | undefined>(
    undefined
  );
  const [publishReview, setPublishReview] = useState<PublishReviewResponse | undefined>(undefined);
  const [publishResult, setPublishResult] = useState<PublishResultResponse | undefined>(undefined);
  const [registryEntries, setRegistryEntries] = useState<AppStoreRegistryEntryDto[]>([]);
  const [publishMessage, setPublishMessage] = useState("Loading publish state from Platform API.");
  const [isInvitingUser, setIsInvitingUser] = useState(false);
  const [isApprovingAccess, setIsApprovingAccess] = useState(false);
  const [isPublishingProject, setIsPublishingProject] = useState(false);

  const visibleAppMembers =
    appAccessSnapshot?.members.map((member) => ({
      user: member.name || member.email,
      type: member.userType,
      role: member.roleName,
      status: member.status,
      lastAccess: member.lastAccessAt ? member.lastAccessAt.slice(0, 10) : "pending"
    })) ?? appMembers;
  const visiblePendingInvites =
    appAccessSnapshot?.invitations.map((invite) => ({
      email: invite.email,
      role: invite.roleKey,
      invitedBy: "Creator User",
      expires: invite.expiresAt ? invite.expiresAt.slice(0, 10) : "not set",
      status: invite.status
    })) ?? pendingInvites;
  const visibleAccessRequests =
    appAccessSnapshot?.accessRequests.map((request) => ({
      id: request.id,
      requester: request.requesterEmail,
      role: request.requestedRoleKey,
      reason: request.reason,
      submitted: request.createdAt.slice(0, 10),
      status: request.status
    })) ?? accessRequests;
  const visibleAppRoles =
    appAccessSnapshot?.roles.map((role) => ({
      role: role.name,
      permissions: role.permissions.join(", "),
      members: String(role.memberCount),
      status: role.memberCount > 0 ? "active" : "ready"
    })) ?? appRoles;
  const visiblePublishChecklist =
    publishReview?.checklist.map((item) => ({
      check: item.label,
      state: item.status,
      detail: item.detail
    })) ?? publishChecklist;
  const visibleDeployment = publishResult?.deployment;
  const visibleRegistryEntry =
    publishResult?.registryEntry ??
    registryEntries.find((entry) => entry.projectId === selectedProject.id);

  function resetPublishAccess() {
    setAppAccessSnapshot(undefined);
    setPublishReview(undefined);
    setPublishResult(undefined);
    setRegistryEntries([]);
  }

  async function refreshCreatorPublishState(projectId: string) {
    const publishState = await loadCreatorPublishState(projectId);
    setAppAccessSnapshot(publishState.access);
    setPublishReview(publishState.review);
    setRegistryEntries(publishState.registry);
    setPublishMessage("Creator app users and publish readiness loaded from Platform API.");
  }

  async function handleInviteUser() {
    setIsInvitingUser(true);
    try {
      const client = createCreatorPlatformClient();
      await client.createAppInvitation(selectedProject.id, {
        email: "finance.manager@company.com",
        roleKey: "manager",
        userType: "internal",
        note: "Join manager approval queue"
      });
      await refreshCreatorPublishState(selectedProject.id);
      setPublishMessage("Invitation sent through Platform API and app access state refreshed.");
    } catch (error) {
      setPublishMessage(
        error instanceof Error
          ? `Invitation failed. Existing app access state was preserved. ${error.message}`
          : "Invitation failed. Existing app access state was preserved."
      );
    } finally {
      setIsInvitingUser(false);
    }
  }

  async function handleApproveAccessRequest() {
    const pendingRequest = appAccessSnapshot?.accessRequests.find(
      (request) => request.status === "pending"
    );
    setIsApprovingAccess(true);
    try {
      const client = createCreatorPlatformClient();
      const targetRequestId = pendingRequest?.id ?? "appreq_local_pending";
      await client.decideAppAccessRequest(selectedProject.id, {
        requestId: targetRequestId,
        decision: "approved"
      });
      await refreshCreatorPublishState(selectedProject.id);
      setPublishMessage(
        "Access request approved through Platform API and membership state refreshed."
      );
    } catch (error) {
      setPublishMessage(
        error instanceof Error
          ? `Access request approval failed. Existing request state was preserved. ${error.message}`
          : "Access request approval failed. Existing request state was preserved."
      );
    } finally {
      setIsApprovingAccess(false);
    }
  }

  async function handlePublishProject() {
    setIsPublishingProject(true);
    try {
      const client = createCreatorPlatformClient();
      const result = await client.publishProject(selectedProject.id);
      setPublishResult(result);
      setRegistryEntries(await client.listAppStoreRegistry());
      setPublishMessage(
        "Published through Platform API. Deployment and App Store registry evidence updated."
      );
    } catch (error) {
      setPublishMessage(
        error instanceof Error
          ? `Publish blocked: ${error.message}`
          : "Publish blocked. Existing deployment evidence was preserved."
      );
    } finally {
      setIsPublishingProject(false);
    }
  }

  return {
    appAccessSnapshot,
    setAppAccessSnapshot,
    publishReview,
    setPublishReview,
    publishResult,
    setPublishResult,
    registryEntries,
    setRegistryEntries,
    publishMessage,
    setPublishMessage,
    isInvitingUser,
    setIsInvitingUser,
    isApprovingAccess,
    setIsApprovingAccess,
    isPublishingProject,
    setIsPublishingProject,
    visibleAppMembers,
    visiblePendingInvites,
    visibleAccessRequests,
    visibleAppRoles,
    visiblePublishChecklist,
    visibleDeployment,
    visibleRegistryEntry,
    resetPublishAccess,
    refreshCreatorPublishState,
    handleInviteUser,
    handleApproveAccessRequest,
    handlePublishProject
  };
}
