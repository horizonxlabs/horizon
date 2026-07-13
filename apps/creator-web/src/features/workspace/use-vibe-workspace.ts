import {
  type PreviewVersionDto,
  type WorkspaceAgentMode,
  type WorkspacePromptResultDto,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";
import { loadWorkspaceState } from "./api";
import { useProjectFiles } from "./use-project-files";
import { useVibeChat } from "./use-vibe-chat";
import { fallbackWorkspacePromptResult, workspaceViewState } from "./workspace-view-state";
import { normalizeWorkspaceMode, persistWorkspaceMode, readWorkspaceMode } from "./workspace-mode";

function browserStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function useVibeWorkspace({ selectedProject }: { selectedProject: CreatorProjectView }) {
  const [promptDraft, setPromptDraft] = useState("");
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshotResponse>();
  const [workspaceResult, setWorkspaceResult] = useState<WorkspacePromptResultDto>();
  const [previewOverride, setPreviewOverride] = useState<PreviewVersionDto>();
  const [workspaceMessage, setWorkspaceMessage] = useState(
    "Using deterministic local workspace evidence until Platform API is configured."
  );
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [vibeTab, setVibeTab] = useState<"preview" | "code" | "database">("preview");
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceAgentMode>(() =>
    readWorkspaceMode(browserStorage(), selectedProject.id)
  );
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const projectFiles = useProjectFiles(selectedProject.id);
  const vibeChat = useVibeChat({
    selectedProjectId: selectedProject.id,
    promptDraft,
    setPromptDraft,
    workspaceMode,
    selectedAttachmentIds: projectFiles.selectedAttachmentIds
  });
  const view = workspaceViewState({
    selectedProject,
    workspaceSnapshot,
    workspaceResult,
    previewOverride
  });

  function resetWorkspace() {
    setWorkspaceSnapshot(undefined);
    setWorkspaceResult(undefined);
    setPreviewOverride(undefined);
  }

  function setWorkspaceMode(mode: WorkspaceAgentMode) {
    const nextMode = normalizeWorkspaceMode(mode);
    persistWorkspaceMode(browserStorage(), selectedProject.id, nextMode);
    setWorkspaceModeState(nextMode);
  }

  useEffect(() => {
    setWorkspaceModeState(readWorkspaceMode(browserStorage(), selectedProject.id));
  }, [selectedProject.id]);

  async function handleSubmitPrompt() {
    setIsSubmittingPrompt(true);
    try {
      const result = await createCreatorPlatformClient().submitWorkspacePrompt(selectedProject.id, {
        prompt: promptDraft,
        attachmentIds: projectFiles.selectedAttachmentIds,
        agentMode: workspaceMode
      });
      setWorkspaceResult(result);
      setPreviewOverride(undefined);
      setWorkspaceSnapshot(await loadWorkspaceState(selectedProject.id));
      setWorkspaceMessage(
        result.guardrail.decision === "block"
          ? "Prompt blocked by guardrail. Existing preview was preserved."
          : "Prompt accepted. Workspace preview and token evidence updated from Platform API."
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("not configured")) {
        setWorkspaceResult(
          fallbackWorkspacePromptResult({
            selectedProjectId: selectedProject.id,
            promptDraft,
            selectedFallbackPreview: view.selectedFallbackPreview
          })
        );
        setPreviewOverride(undefined);
        setWorkspaceMessage(
          "Local fallback generated deterministic workspace evidence. Configure Platform API to persist it."
        );
      } else {
        setWorkspaceMessage(
          "Prompt failed. Existing preview was preserved; check Platform API logs for details."
        );
      }
    } finally {
      setIsSubmittingPrompt(false);
    }
  }

  async function handleRefreshPreview() {
    setIsRefreshingPreview(true);
    try {
      setPreviewOverride(
        await createCreatorPlatformClient().refreshWorkspacePreview(selectedProject.id)
      );
      setWorkspaceMessage("Preview refreshed from Platform API.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("not configured")) {
        setPreviewOverride(view.visiblePreview);
        setWorkspaceMessage("Local fallback preview refreshed deterministically.");
      } else {
        setWorkspaceMessage("Preview refresh failed. Existing preview remains visible.");
      }
    } finally {
      setIsRefreshingPreview(false);
    }
  }

  return {
    promptDraft,
    setPromptDraft,
    workspaceSnapshot,
    setWorkspaceSnapshot,
    workspaceResult,
    setWorkspaceResult,
    previewOverride,
    setPreviewOverride,
    workspaceMessage,
    setWorkspaceMessage,
    isSubmittingPrompt,
    setIsSubmittingPrompt,
    ...vibeChat,
    vibeTab,
    setVibeTab,
    workspaceMode,
    setWorkspaceMode,
    isRefreshingPreview,
    setIsRefreshingPreview,
    ...projectFiles,
    ...view,
    resetWorkspace,
    handleSubmitPrompt,
    handleRefreshPreview
  };
}
