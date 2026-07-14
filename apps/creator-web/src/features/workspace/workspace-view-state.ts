import {
  type PreviewVersionDto,
  type WorkspacePromptResultDto,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import type { CreatorProjectView } from "@/shared/types";

export function workspaceViewState({
  selectedProject,
  workspaceSnapshot,
  workspaceResult,
  previewOverride
}: {
  selectedProject: CreatorProjectView;
  workspaceSnapshot: WorkspaceSnapshotResponse | undefined;
  workspaceResult: WorkspacePromptResultDto | undefined;
  previewOverride: PreviewVersionDto | undefined;
}) {
  const emptyPreview: PreviewVersionDto = {
    id: "",
    projectId: selectedProject.id,
    version: "No preview yet",
    summary: "Submit a workspace prompt to create the first preview.",
    device: "desktop",
    screenTitle: selectedProject.name,
    highlights: [],
    createdAt: ""
  };
  const latestTask = workspaceResult?.task ?? workspaceSnapshot?.tasks.at(-1);
  const visibleTaskSteps = latestTask?.steps ?? [];
  const visiblePreview =
    previewOverride ??
    workspaceResult?.preview ??
    workspaceSnapshot?.preview ??
    emptyPreview;
  const visibleHighlights = visiblePreview.highlights;
  const visibleTokenBudget = workspaceResult?.tokenBudget ??
    workspaceSnapshot?.tokenBudget ?? {
      remainingToday: 0,
      remainingMonth: 0,
      requestEstimate: 0
    };
  const visibleUsageRows = (
    workspaceSnapshot?.usage.length
      ? workspaceSnapshot.usage
      : workspaceResult?.usage
        ? [workspaceResult.usage]
        : []
  ).map((usage) => ({
    prompt: usage.prompt,
    scenario: usage.scenario,
    tokens: String(usage.tokensUsed),
    result: visiblePreview.version
  }));

  return {
    hasPreview: visiblePreview.id.length > 0,
    latestTask,
    visibleTaskSteps,
    visiblePreview,
    visibleHighlights,
    visibleTokenBudget,
    visibleUsageRows,
    visibleUsage: visibleUsageRows
  };
}
