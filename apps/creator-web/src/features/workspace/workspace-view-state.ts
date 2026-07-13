import {
  type PreviewVersionDto,
  type WorkspacePromptResultDto,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import { fallbackPreview, fallbackTaskSteps, usageRows } from "./fixtures";
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
  const selectedFallbackPreview: PreviewVersionDto = {
    ...fallbackPreview,
    projectId: selectedProject.id,
    screenTitle: selectedProject.name,
    summary: `${selectedProject.name} preview will appear after the first AI workspace prompt.`
  };
  const latestTask = workspaceResult?.task ?? workspaceSnapshot?.tasks.at(-1);
  const visibleTaskSteps = latestTask?.steps ?? fallbackTaskSteps;
  const visiblePreview =
    previewOverride ??
    workspaceResult?.preview ??
    workspaceSnapshot?.preview ??
    selectedFallbackPreview;
  const visibleHighlights = visiblePreview.highlights.length
    ? visiblePreview.highlights
    : selectedFallbackPreview.highlights;
  const visibleTokenBudget = workspaceResult?.tokenBudget ??
    workspaceSnapshot?.tokenBudget ?? {
      remainingToday: 880,
      remainingMonth: 4880,
      requestEstimate: 120
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
    selectedFallbackPreview,
    latestTask,
    visibleTaskSteps,
    visiblePreview,
    visibleHighlights,
    visibleTokenBudget,
    visibleUsageRows,
    visibleUsage: visibleUsageRows.length ? visibleUsageRows : usageRows
  };
}

export function fallbackWorkspacePromptResult({
  selectedProjectId,
  promptDraft,
  selectedFallbackPreview
}: {
  selectedProjectId: string;
  promptDraft: string;
  selectedFallbackPreview: PreviewVersionDto;
}): WorkspacePromptResultDto {
  const now = new Date().toISOString();
  return {
    guardrail: { decision: "allow", eventId: "local_guardrail_0001" },
    task: {
      id: "local_workspace_task_0001",
      projectId: selectedProjectId,
      prompt: promptDraft,
      status: "ready",
      guardrailDecision: "allow",
      guardrailEventId: "local_guardrail_0001",
      steps: fallbackTaskSteps,
      createdByUserId: "local_creator",
      createdAt: now
    },
    preview: {
      ...selectedFallbackPreview,
      projectId: selectedProjectId,
      summary: `Local preview updated: ${promptDraft}`,
      createdAt: now
    },
    usage: {
      id: "local_usage_0001",
      projectId: selectedProjectId,
      taskId: "local_workspace_task_0001",
      actorId: "local_creator",
      scenario: "frontend_coding",
      providerId: "local_fallback",
      model: "deterministic-preview",
      prompt: promptDraft,
      tokensUsed: 120,
      occurredAt: now,
      status: "succeeded"
    },
    tokenBudget: { remainingToday: 880, remainingMonth: 4880, requestEstimate: 120 }
  };
}
