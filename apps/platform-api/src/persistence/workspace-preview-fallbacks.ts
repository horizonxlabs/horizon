import type { PreviewVersion } from "../platform-services";

export interface WorkspaceCodeCheckpointRecord {
  id: string;
  projectId: string;
  tag: string;
  commitSha: string;
  label: string;
  createdAt: Date | string;
}

export function checkpointPreview(
  projectId: string,
  checkpoint: WorkspaceCodeCheckpointRecord
): PreviewVersion {
  const shortCommit = checkpoint.commitSha.slice(0, 12);
  return {
    id: `preview_${checkpoint.id}`,
    projectId,
    version: `preview-${shortCommit}`,
    summary: `Validated workspace checkpoint: ${checkpoint.label}`,
    device: "desktop",
    screenTitle: checkpoint.label,
    highlights: [`Commit ${shortCommit}`, "Workspace build validated", "Ready for publish review"],
    createdAt:
      checkpoint.createdAt instanceof Date
        ? checkpoint.createdAt.toISOString()
        : checkpoint.createdAt
  };
}

export function emptyWorkspacePreview(projectId: string): PreviewVersion {
  return {
    id: `preview_${projectId}_empty`,
    projectId,
    version: "preview-0000",
    summary: "No generated preview yet",
    device: "desktop",
    screenTitle: "Leave Management",
    highlights: ["Baseline PRD loaded", "Prompt required", "No generated changes"],
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString()
  };
}
