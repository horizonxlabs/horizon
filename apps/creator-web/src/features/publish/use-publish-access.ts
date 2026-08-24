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
import type { CreatorStatusTone } from "@/shared";
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
  const [appAccessSnapshot, setAppAccessSnapshotState] = useState<
    AppAccessSnapshotResponse | undefined
  >(undefined);
  const appAccessSnapshotRef = useRef<AppAccessSnapshotResponse | undefined>(undefined);
  const [accessLoadState, setAccessLoadState] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [publishReview, setPublishReview] = useState<PublishReviewResponse | undefined>(undefined);
  const [publishResult, setPublishResult] = useState<PublishResultResponse | undefined>(undefined);
  const [registryEntries, setRegistryEntries] = useState<AppStoreRegistryEntryDto[]>([]);
  const [runtimeDeployments, setRuntimeDeployments] = useState<WorkspaceDeploymentDto[]>([]);
  const [publishMessage, setPublishMessageState] = useState(
    "Loading access and publish information."
  );
  const [publishMessageTone, setPublishMessageTone] = useState<CreatorStatusTone>("info");
  const [publishMessageTechnicalDetails, setPublishMessageTechnicalDetails] = useState<
    string | undefined
  >(undefined);
  const [isInvitingUser, setIsInvitingUser] = useState(false);
  const [decidingAccessRequestIds, setDecidingAccessRequestIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const accessDecisionRequests = useRef(new Map<string, Promise<void>>());
  const [isPublishingProject, setIsPublishingProject] = useState(false);
  const refreshGenerationRef = useRef(0);
  const activeProjectIdRef = useRef<string | undefined>(selectedProject.id || undefined);

  type RefreshGuard = { generation: number; projectId: string };

  function createRefreshGuard(projectId: string): RefreshGuard | undefined {
    if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId) return undefined;
    activeProjectIdRef.current = projectId;
    return { generation: refreshGenerationRef.current, projectId };
  }

  function isCurrentRefresh(guard: RefreshGuard): boolean {
    return (
      guard.generation === refreshGenerationRef.current &&
      guard.projectId === activeProjectIdRef.current
    );
  }

  function setPublishMessage(message: string) {
    setPublishMessageState(message);
    setPublishMessageTone("info");
    setPublishMessageTechnicalDetails(undefined);
  }

  function setPublishFeedback(message: string, tone: CreatorStatusTone, technicalDetails?: string) {
    setPublishMessageState(message);
    setPublishMessageTone(tone);
    setPublishMessageTechnicalDetails(technicalDetails);
  }

  function technicalDetails(error: unknown): string | undefined {
    return error instanceof Error ? error.message : undefined;
  }

  function setAppAccessSnapshot(snapshot: AppAccessSnapshotResponse | undefined) {
    appAccessSnapshotRef.current = snapshot;
    setAppAccessSnapshotState(snapshot);
    setAccessLoadState(snapshot ? "ready" : "loading");
  }

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
    refreshGenerationRef.current += 1;
    activeProjectIdRef.current = undefined;
    setAppAccessSnapshot(undefined);
    setPublishReview(undefined);
    setPublishResult(undefined);
    setRegistryEntries([]);
    setRuntimeDeployments([]);
    setIsPublishingProject(false);
    setPublishFeedback("Loading access and publish information.", "info");
  }

  async function loadAccessForRefresh(projectId: string, guard: RefreshGuard) {
    if (!appAccessSnapshotRef.current && isCurrentRefresh(guard)) setAccessLoadState("loading");
    try {
      const access = await loadAccessState(projectId);
      if (!isCurrentRefresh(guard)) return undefined;
      setAppAccessSnapshot(access);
      return access;
    } catch (error) {
      if (!isCurrentRefresh(guard)) return undefined;
      if (!appAccessSnapshotRef.current) setAccessLoadState("unavailable");
      throw error;
    }
  }

  async function refreshCreatorAccessState(projectId: string) {
    const guard = createRefreshGuard(projectId);
    if (!guard) return undefined;
    return loadAccessForRefresh(projectId, guard);
  }

  async function refreshCreatorPublishState(projectId: string) {
    const guard = createRefreshGuard(projectId);
    if (!guard) return;
    try {
      const access = await loadAccessForRefresh(projectId, guard);
      if (!access || !isCurrentRefresh(guard)) return;
    } catch (error) {
      if (!isCurrentRefresh(guard)) return;
      setPublishFeedback(
        "Access information could not be loaded. Retry to view the latest members and requests.",
        "danger",
        technicalDetails(error)
      );
      throw error;
    }
    try {
      const publishState = await loadPublishState(projectId);
      if (!isCurrentRefresh(guard)) return;
      setPublishReview(publishState.review);
      setRegistryEntries(publishState.registry);
      setRuntimeDeployments(publishState.deployments);
      setPublishFeedback("Access information and publish readiness are up to date.", "success");
    } catch (error) {
      if (!isCurrentRefresh(guard)) return;
      setPublishFeedback(
        "Access information loaded. Publish readiness is unavailable.",
        "warning",
        technicalDetails(error)
      );
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
      setPublishFeedback(`${email} already has a pending invitation for this app.`, "warning");
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
      setPublishFeedback(
        "Invitation could not be sent. Existing access was unchanged.",
        "danger",
        technicalDetails(error)
      );
      setIsInvitingUser(false);
      return false;
    }

    try {
      await refreshCreatorAccessState(selectedProject.id);
      setPublishFeedback(
        `Invitation sent to ${email}. Access information is up to date.`,
        "success"
      );
    } catch (error) {
      setPublishFeedback(
        `Invitation sent to ${email}, but access information could not be refreshed.`,
        "warning",
        technicalDetails(error)
      );
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
          setPublishFeedback(
            `Access request could not be ${decision}. No access changes were applied.`,
            "danger",
            technicalDetails(error)
          );
          return;
        }

        try {
          await refreshCreatorAccessState(selectedProject.id);
          setPublishFeedback(
            `Access request ${decision}. Access information is up to date.`,
            "success"
          );
        } catch (error) {
          setPublishFeedback(
            `Access request ${decision}, but access information could not be refreshed.`,
            "warning",
            technicalDetails(error)
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
    const guard = createRefreshGuard(selectedProject.id);
    if (!guard) return;
    setIsPublishingProject(true);
    try {
      const client = clientFactory();
      const result = await client.publishProject(selectedProject.id);
      if (!isCurrentRefresh(guard)) return;
      setPublishResult(result);
      const [registry, deployments] = await Promise.all([
        client.listAppStoreRegistry(),
        client.listDeployments(selectedProject.id)
      ]);
      if (!isCurrentRefresh(guard)) return;
      setRegistryEntries(registry);
      setRuntimeDeployments(deployments);
      setPublishFeedback(
        "Project published. Deployment and registry information is up to date.",
        "success"
      );
    } catch (error) {
      if (!isCurrentRefresh(guard)) return;
      setPublishFeedback(
        "Project could not be published. Existing deployment information was preserved.",
        "danger",
        technicalDetails(error)
      );
    } finally {
      if (isCurrentRefresh(guard)) setIsPublishingProject(false);
    }
  }

  return {
    appAccessSnapshot,
    setAppAccessSnapshot,
    accessLoadState,
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
    publishMessageTone,
    publishMessageTechnicalDetails,
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
