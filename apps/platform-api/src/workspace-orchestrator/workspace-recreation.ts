import type { WorkspaceContainerRecord } from "@evcp/types";
import { buildDevContainerSpec } from "./docker-engine";
import { workspacePhysicalKey, workspacePreviewBase } from "./runtime-location";
import { workspaceVolumeName } from "./workspace-lifecycle";

export function buildWorkspaceRecoverySpec(
  record: WorkspaceContainerRecord,
  env: Record<string, string>,
  settings: { image: string; cpuCores: number; memoryMb: number; network: string }
) {
  return buildDevContainerSpec({
    ...settings,
    projectId: record.projectId,
    slug: workspacePhysicalKey(record),
    env: { ...env, EVCP_PREVIEW_BASE: workspacePreviewBase(record) },
    workspaceVolume: workspaceVolumeName(workspacePhysicalKey(record))
  });
}
