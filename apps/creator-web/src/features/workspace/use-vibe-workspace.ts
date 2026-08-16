import {
  type PreviewVersionDto,
  type WorkspacePromptResultDto,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import { useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";
import { loadWorkspaceState } from "./api";
import { useProjectFiles } from "./use-project-files";
import { useVibeChat } from "./use-vibe-chat";
import { workspaceViewState } from "./workspace-view-state";
import type { WorkspaceTab } from "./workspace-chrome";

export function useVibeWorkspace({ selectedProject }: { selectedProject: CreatorProjectView }) {
  const [promptDraft, setPromptDraft] = useState("");
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshotResponse>();
  const [workspaceResult, setWorkspaceResult] = useState<WorkspacePromptResultDto>();
  const [previewOverride, setPreviewOverride] = useState<PreviewVersionDto>();
  const [workspaceMessage, setWorkspaceMessage] = useState(
    "Loading workspace state from Platform API."
  );
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [vibeTab, setVibeTab] = useState<WorkspaceTab>("preview");
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const projectFiles = useProjectFiles(selectedProject.id);
  const vibeChat = useVibeChat({
    selectedProjectId: selectedProject.id,
    promptDraft,
    setPromptDraft,
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

  async function handleSubmitPrompt() {
    setIsSubmittingPrompt(true);
    try {
      const result = await createCreatorPlatformClient().submitWorkspacePrompt(selectedProject.id, {
        prompt: promptDraft,
        attachmentIds: projectFiles.selectedAttachmentIds
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
      setWorkspaceMessage(
        error instanceof Error
          ? `Prompt failed. Existing preview was preserved. ${error.message}`
          : "Prompt failed. Existing preview was preserved; check Platform API logs for details."
      );
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
      setWorkspaceMessage(
        error instanceof Error
          ? `Preview refresh failed. Existing preview remains visible. ${error.message}`
          : "Preview refresh failed. Existing preview remains visible."
      );
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
    isRefreshingPreview,
    setIsRefreshingPreview,
    ...projectFiles,
    ...view,
    resetWorkspace,
    handleSubmitPrompt,
    handleRefreshPreview
  };
}
