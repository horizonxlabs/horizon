import type { PreviewVersionDto, WorkspaceTaskStepDto } from "@evcp/api-client";

export const fallbackPreview: PreviewVersionDto = {
  id: "preview_local_0001",
  projectId: "proj_placeholder",
  version: "preview-0001",
  summary: "Updating Leave Management preview with WFH leave type and manager approval visibility.",
  device: "desktop",
  screenTitle: "Leave Management",
  highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"],
  createdAt: "2026-07-04T00:00:00.000Z"
};
export const fallbackTaskSteps: WorkspaceTaskStepDto[] = [
  "Understanding request",
  "Loading PRD baseline",
  "Guardrail pre-check",
  "Selecting skill",
  "Generating frontend",
  "Applying auth/role rules",
  "Building preview",
  "Running checks",
  "Ready"
].map((label, index) => ({
  id: `local_step_${index + 1}`,
  label,
  status: (index < 9 ? "done" : "pending") as WorkspaceTaskStepDto["status"],
  order: index + 1
}));
export const usageRows = [
  {
    prompt: "Add WFH leave type",
    scenario: "frontend_coding",
    tokens: "120",
    result: "preview-0001"
  }
];
