import {
  type AppInvitationInput,
  type AppAccessSnapshotResponse,
  type AppStoreRegistryEntryDto,
  type PublishResultResponse,
  type PublishReviewResponse,
  type WorkspaceDeploymentDto
} from "@evcp/api-client";
import { useRef, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";
import { loadCreatorAccessState, loadCreatorPublishState } from "./api";

export function usePublishAccess({
  selectedProject,
  clientFactory = createCreatorPlatformClient,
  loadAccessState = loadCreatorAccessState,
  loadPublishState = loadCreatorPublishState
}: {
  selectedProject: CreatorProjectView;
  clientFactory?: typeof createCreatorPlatformClient;
  loadAccessState?: typeof loadCreatorAccessState;
  loadPublishState?: typeof loadCreatorPublishState;
}) {
  const [appAccessSnapshot, setAppAccessSnapshot] = useState<AppAccessSnapshotResponse | undefined>(
    undefined
  );
  const [publishReview, setPublishReview] = useState<PublishReviewResponse | undefined>(undefined);
  const [publishResult, setPublishResult] = useState<PublishResultResponse | undefined>(undefined);
  const [registryEntries, setRegistryEntries] = useState<AppStoreRegistryEntryDto[]>([]);
  const [runtimeDeployments, setRuntimeDeployments] = useState<WorkspaceDeploymentDto[]>([]);
  const [publishMessage, setPublishMessage] = useState("Loading publish state from Platform API.");
  const [isInvitingUser, setIsInvitingUser] = useState(false);
  const [decidingAccessRequestIds, setDecidingAccessRequestIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const accessDecisionRequests = useRef(new Map<string, Promise<void>>());
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
    appAccessSnapshot?.invitations
      .filter((invite) => ["pending", "approval_required"].includes(invite.status))
      .map((invite) => ({
        email: invite.email,
        type: invite.userType,
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
  const visibleRegistryEntry =
    publishResult?.registryEntry ??
    registryEntries.find((entry) => entry.projectId === selectedProject.id);
  const latestRuntimeDeployment = [...runtimeDeployments]
    .filter((deployment) => deployment.healthStatus === "healthy")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  const visibleDeployment = publishResult?.deployment
    ? {
        id: publishResult.deployment.id,
        status: publishResult.deployment.status,
        environment: publishResult.deployment.environment ?? "app_store",
        manifestVersion:
          publishResult.deployment.manifestVersion ??
          publishResult.manifest.manifestVersion ??
          "unknown"
      }
    : latestRuntimeDeployment
      ? {
          id: latestRuntimeDeployment.id,
          status: latestRuntimeDeployment.healthStatus,
          environment: latestRuntimeDeployment.environment,
          manifestVersion:
            visibleRegistryEntry?.manifestVersion ??
            publishReview?.manifest.manifestVersion ??
            "unknown"
        }
      : undefined;

  function resetPublishAccess() {
    setAppAccessSnapshot(undefined);
    setPublishReview(undefined);
    setPublishResult(undefined);
    setRegistryEntries([]);
    setRuntimeDeployments([]);
  }

  async function refreshCreatorAccessState(projectId: string) {
    const access = await loadAccessState(projectId);
    setAppAccessSnapshot(access);
    return access;
  }

  async function refreshCreatorPublishState(projectId: string) {
    try {
      await refreshCreatorAccessState(projectId);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setPublishMessage(`App access unavailable.${detail || " Retry to load project access."}`);
      throw error;
    }
    try {
      const publishState = await loadPublishState(projectId);
      setPublishReview(publishState.review);
      setRegistryEntries(publishState.registry);
      setRuntimeDeployments(publishState.deployments);
      setPublishMessage("Creator app users and publish readiness loaded from Platform API.");
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setPublishMessage(`App access loaded. Publish readiness unavailable.${detail}`);
      throw error;
    }
  }

  async function handleInviteUser(input: AppInvitationInput): Promise<boolean> {
    const email = input.email.trim().toLowerCase();
    const duplicate = appAccessSnapshot?.invitations.find(
      (invitation) =>
        invitation.email.trim().toLowerCase() === email &&
        ["pending", "approval_required"].includes(invitation.status)
    );
    if (duplicate) {
      setPublishMessage(`${email} already has a pending invitation for this app.`);
      return false;
    }

    setIsInvitingUser(true);
    try {
      const client = clientFactory();
      await client.createAppInvitation(selectedProject.id, {
        ...input,
        email,
        note: input.note?.trim() || undefined
      });
    } catch (error) {
      setPublishMessage(
        error instanceof Error
          ? `Invitation failed. Existing app access state was preserved. ${error.message}`
          : "Invitation failed. Existing app access state was preserved."
      );
      setIsInvitingUser(false);
      return false;
    }

    try {
      await refreshCreatorAccessState(selectedProject.id);
      setPublishMessage(`Invitation sent to ${email}. App access state refreshed.`);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      setPublishMessage(`Invitation sent to ${email}. App access refresh failed.${detail}`);
    } finally {
      setIsInvitingUser(false);
    }
    return true;
  }

  async function handleAccessRequestDecision(requestId: string, decision: "approved" | "rejected") {
    const existing = accessDecisionRequests.current.get(requestId);
    if (existing) return existing;

    const request = (async () => {
      setDecidingAccessRequestIds((current) => {
        const next = new Set(current);
        next.add(requestId);
        return next;
      });
      try {
        try {
          const client = clientFactory();
          await client.decideAppAccessRequest(selectedProject.id, {
            requestId,
            decision
          });
        } catch (error) {
          setPublishMessage(
            error instanceof Error
              ? `Access decision failed: ${error.message}`
              : "Access decision failed."
          );
          return;
        }

        try {
          await refreshCreatorAccessState(selectedProject.id);
          setPublishMessage(`Access request ${decision} through Platform API.`);
        } catch (error) {
          const detail = error instanceof Error ? `: ${error.message}` : ".";
          setPublishMessage(
            `Access request ${decision} through Platform API. Governed state refresh failed${detail}`
          );
        }
      } finally {
        setDecidingAccessRequestIds((current) => {
          const next = new Set(current);
          next.delete(requestId);
          return next;
        });
        accessDecisionRequests.current.delete(requestId);
      }
    })();

    accessDecisionRequests.current.set(requestId, request);
    return request;
  }

  async function handlePublishProject() {
    setIsPublishingProject(true);
    try {
      const client = clientFactory();
      const result = await client.publishProject(selectedProject.id);
      setPublishResult(result);
      const [registry, deployments] = await Promise.all([
        client.listAppStoreRegistry(),
        client.listDeployments(selectedProject.id)
      ]);
      setRegistryEntries(registry);
      setRuntimeDeployments(deployments);
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
    runtimeDeployments,
    setRuntimeDeployments,
    publishMessage,
    setPublishMessage,
    isInvitingUser,
    setIsInvitingUser,
    decidingAccessRequestIds,
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
    refreshCreatorAccessState,
    refreshCreatorPublishState,
    handleInviteUser,
    handleAccessRequestDecision,
    handlePublishProject
  };
}
