import {
  type AppAccessSnapshotResponse,
  type AppStoreRegistryEntryDto,
  type PublishResultResponse,
  type PublishReviewResponse
} from "@evcp/api-client";
import { useState } from "react";
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
  const [decidingAccessRequestId, setDecidingAccessRequestId] = useState<string>();
  const [isPublishingProject, setIsPublishingProject] = useState(false);

  const visibleAppMembers =
    appAccessSnapshot?.members.map((member) => ({
      user: member.name || member.email,
      type: member.userType,
      role: member.roleName,
      status: member.status,
      lastAccess: member.lastAccessAt ? member.lastAccessAt.slice(0, 10) : "pending"
    })) ?? [];
  const visiblePendingInvites =
    appAccessSnapshot?.invitations.map((invite) => ({
      email: invite.email,
      role: invite.roleKey,
      invitedBy: "Creator User",
      expires: invite.expiresAt ? invite.expiresAt.slice(0, 10) : "not set",
      status: invite.status
    })) ?? [];
  const visibleAccessRequests =
    appAccessSnapshot?.accessRequests.map((request) => ({
      id: request.id,
      requester: request.requesterEmail,
      role: request.requestedRoleKey,
      reason: request.reason,
      submitted: request.createdAt.slice(0, 10),
      status: request.status
    })) ?? [];
  const visibleAppRoles =
    appAccessSnapshot?.roles.map((role) => ({
      role: role.name,
      permissions: role.permissions.join(", "),
      members: String(role.memberCount),
      status: role.memberCount > 0 ? "active" : "ready"
    })) ?? [];
  const visiblePublishChecklist =
    publishReview?.checklist.map((item) => ({
      check: item.label,
      state: item.status,
      detail: item.detail
    })) ?? [];
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

  async function handleAccessRequestDecision(requestId: string, decision: "approved" | "rejected") {
    setDecidingAccessRequestId(requestId);
    try {
      const client = createCreatorPlatformClient();
      await client.decideAppAccessRequest(selectedProject.id, {
        requestId,
        decision
      });
      await refreshCreatorPublishState(selectedProject.id);
      setPublishMessage(`Access request ${decision} through Platform API.`);
    } catch (error) {
      setPublishMessage(
        error instanceof Error
          ? `Access decision failed: ${error.message}`
          : "Access decision failed."
      );
    } finally {
      setDecidingAccessRequestId(undefined);
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
    decidingAccessRequestId,
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
    handleAccessRequestDecision,
    handlePublishProject
  };
}
