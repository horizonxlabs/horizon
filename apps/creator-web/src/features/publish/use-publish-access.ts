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
import { createAccessView } from "./access-view";
import { loadCreatorAccessState, loadCreatorPublishState } from "./api";
import { type ProjectRequestGuard, useProjectRequestGuard } from "./project-request-guard";

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
  const [publishReadinessState, setPublishReadinessState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
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
  type AccessDecisionRequest = { promise: Promise<void> };
  const accessDecisionRequests = useRef(new Map<string, AccessDecisionRequest>());
  const [isPublishingProject, setIsPublishingProject] = useState(false);
  const requestGuard = useProjectRequestGuard(selectedProject.id || undefined);

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

  const { visibleAppMembers, visiblePendingInvites, visibleAccessRequests, visibleAppRoles } =
    createAccessView(appAccessSnapshot);
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
    requestGuard.reset();
    accessDecisionRequests.current.clear();
    setAppAccessSnapshot(undefined);
    setPublishReview(undefined);
    setPublishReadinessState("loading");
    setPublishResult(undefined);
    setRegistryEntries([]);
    setRuntimeDeployments([]);
    setIsInvitingUser(false);
    setDecidingAccessRequestIds(new Set());
    setIsPublishingProject(false);
    setPublishFeedback("Loading access and publish information.", "info");
  }

  async function loadAccessForRefresh(projectId: string, guard: ProjectRequestGuard) {
    if (!appAccessSnapshotRef.current && requestGuard.isCurrent(guard)) {
      setAccessLoadState("loading");
    }
    try {
      const access = await loadAccessState(projectId);
      if (!requestGuard.isCurrent(guard)) return undefined;
      setAppAccessSnapshot(access);
      return access;
    } catch (error) {
      if (!requestGuard.isCurrent(guard)) return undefined;
      if (!appAccessSnapshotRef.current) setAccessLoadState("unavailable");
      throw error;
    }
  }

  async function refreshCreatorAccessState(projectId: string) {
    const guard = requestGuard.capture(projectId);
    if (!guard) return undefined;
    return loadAccessForRefresh(projectId, guard);
  }

  async function refreshCreatorPublishState(projectId: string) {
    const guard = requestGuard.capture(projectId);
    if (!guard) return;
    setPublishReadinessState("loading");
    try {
      const access = await loadAccessForRefresh(projectId, guard);
      if (!access || !requestGuard.isCurrent(guard)) return;
    } catch (error) {
      if (!requestGuard.isCurrent(guard)) return;
      setPublishReadinessState("unavailable");
      setPublishFeedback(
        "Access information could not be loaded. Retry to view the latest members and requests.",
        "danger",
        technicalDetails(error)
      );
      throw error;
    }
    try {
      const publishState = await loadPublishState(projectId);
      if (!requestGuard.isCurrent(guard)) return;
      setPublishReview(publishState.review);
      setRegistryEntries(publishState.registry);
      setRuntimeDeployments(publishState.deployments);
      setPublishReadinessState("ready");
      setPublishFeedback("Access information and publish readiness are up to date.", "success");
    } catch (error) {
      if (!requestGuard.isCurrent(guard)) return;
      setPublishReadinessState("unavailable");
      setPublishFeedback(
        "Access information loaded. Publish readiness is unavailable.",
        "warning",
        technicalDetails(error)
      );
      throw error;
    }
  }

  async function handleInviteUser(input: AppInvitationInput): Promise<boolean> {
    const projectId = selectedProject.id;
    const guard = requestGuard.capture(projectId);
    if (!guard) return false;
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
      try {
        const client = clientFactory();
        await client.createAppInvitation(projectId, {
          ...input,
          email,
          note: input.note?.trim() || undefined
        });
      } catch (error) {
        if (requestGuard.isCurrent(guard)) {
          setPublishFeedback(
            "Invitation could not be sent. Existing access was unchanged.",
            "danger",
            technicalDetails(error)
          );
        }
        return false;
      }

      if (!requestGuard.isCurrent(guard)) return false;
      try {
        const access = await loadAccessForRefresh(projectId, guard);
        if (!access || !requestGuard.isCurrent(guard)) return false;
        setPublishFeedback(
          `Invitation sent to ${email}. Access information is up to date.`,
          "success"
        );
      } catch (error) {
        if (!requestGuard.isCurrent(guard)) return false;
        setPublishFeedback(
          `Invitation sent to ${email}, but access information could not be refreshed.`,
          "warning",
          technicalDetails(error)
        );
      }
      return true;
    } finally {
      if (requestGuard.isCurrent(guard)) setIsInvitingUser(false);
    }
  }

  async function handleAccessRequestDecision(requestId: string, decision: "approved" | "rejected") {
    const projectId = selectedProject.id;
    const guard = requestGuard.capture(projectId);
    if (!guard) return;
    const existing = accessDecisionRequests.current.get(requestId);
    if (existing) return existing.promise;

    const requestRecord = {} as AccessDecisionRequest;
    const request = (async () => {
      await Promise.resolve();
      if (
        !requestGuard.isCurrent(guard) ||
        accessDecisionRequests.current.get(requestId) !== requestRecord
      ) {
        return;
      }
      setDecidingAccessRequestIds((current) => {
        const next = new Set(current);
        next.add(requestId);
        return next;
      });
      try {
        try {
          const client = clientFactory();
          await client.decideAppAccessRequest(projectId, {
            requestId,
            decision
          });
        } catch (error) {
          if (requestGuard.isCurrent(guard)) {
            setPublishFeedback(
              `Access request could not be ${decision}. No access changes were applied.`,
              "danger",
              technicalDetails(error)
            );
          }
          return;
        }

        if (!requestGuard.isCurrent(guard)) return;
        try {
          const access = await loadAccessForRefresh(projectId, guard);
          if (!access || !requestGuard.isCurrent(guard)) return;
          setPublishFeedback(
            `Access request ${decision}. Access information is up to date.`,
            "success"
          );
        } catch (error) {
          if (!requestGuard.isCurrent(guard)) return;
          setPublishFeedback(
            `Access request ${decision}, but access information could not be refreshed.`,
            "warning",
            technicalDetails(error)
          );
        }
      } finally {
        if (
          requestGuard.isCurrent(guard) &&
          accessDecisionRequests.current.get(requestId) === requestRecord
        ) {
          setDecidingAccessRequestIds((current) => {
            const next = new Set(current);
            next.delete(requestId);
            return next;
          });
          accessDecisionRequests.current.delete(requestId);
        }
      }
    })();

    requestRecord.promise = request;
    accessDecisionRequests.current.set(requestId, requestRecord);
    return request;
  }

  async function handlePublishProject() {
    const guard = requestGuard.capture(selectedProject.id);
    if (!guard) return;
    setIsPublishingProject(true);
    try {
      const client = clientFactory();
      const result = await client.publishProject(selectedProject.id);
      if (!requestGuard.isCurrent(guard)) return;
      setPublishResult(result);
      const [registry, deployments] = await Promise.all([
        client.listAppStoreRegistry(),
        client.listDeployments(selectedProject.id)
      ]);
      if (!requestGuard.isCurrent(guard)) return;
      setRegistryEntries(registry);
      setRuntimeDeployments(deployments);
      setPublishFeedback(
        "Project published. Deployment and registry information is up to date.",
        "success"
      );
    } catch (error) {
      if (!requestGuard.isCurrent(guard)) return;
      setPublishFeedback(
        "Project could not be published. Existing deployment information was preserved.",
        "danger",
        technicalDetails(error)
      );
    } finally {
      if (requestGuard.isCurrent(guard)) setIsPublishingProject(false);
    }
  }

  return {
    appAccessSnapshot,
    setAppAccessSnapshot,
    accessLoadState,
    publishReview,
    publishReadinessState,
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
