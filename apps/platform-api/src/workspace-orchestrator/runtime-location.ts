import type { WorkspaceContainerRecord } from "@evcp/types";
import { resourceKeyForProject } from "./resource-ports";
import type { DockerEngine } from "./docker-engine";

export function workspacePhysicalKey(
  record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">
): string {
  return record.resourceKey ?? resourceKeyForProject(record.projectId);
}

export function workspaceContainerName(
  record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">
): string {
  return `evcp-ws-${workspacePhysicalKey(record)}`;
}

export function workspacePreviewBase(
  record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey">
): string {
  return `/preview/${workspacePhysicalKey(record)}`;
}

export type WorkspacePreviewLocation = {
  containerName: string;
  previewKey: string;
  previewBase: string;
};

export async function resolveWorkspacePreviewLocation(
  docker: Pick<DockerEngine, "inspectContainer">,
  record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey" | "containerId">
): Promise<WorkspacePreviewLocation | null> {
  if (!record.containerId) return null;
  const physicalKey = workspacePhysicalKey(record);
  const logicalKey = resourceKeyForProject(record.projectId);
  const exactRuntime = (container: { containerId: string; env: string[] } | null) =>
    container?.containerId === record.containerId;
  const hasPreviewBase = (container: { env: string[] }, previewKey: string) =>
    container.env.includes(`EVCP_PREVIEW_BASE=/preview/${previewKey}`);
  const physicalName = workspaceContainerName(record);
  const physical = await docker.inspectContainer(physicalName);
  if (physical && exactRuntime(physical) && hasPreviewBase(physical, physicalKey)) {
    return {
      containerName: physicalName,
      previewKey: physicalKey,
      previewBase: `/preview/${physicalKey}`
    };
  }
  if (physicalKey === logicalKey) return null;

  const legacyName = `evcp-ws-${logicalKey}`;
  const legacy = await docker.inspectContainer(legacyName);
  if (!legacy || !exactRuntime(legacy) || !hasPreviewBase(legacy, logicalKey)) return null;
  return {
    containerName: legacyName,
    previewKey: logicalKey,
    previewBase: `/preview/${logicalKey}`
  };
}

export async function inspectWorkspaceContainer(
  docker: Pick<DockerEngine, "inspectContainer">,
  record: Pick<WorkspaceContainerRecord, "projectId" | "resourceKey" | "containerId">
) {
  const found = await docker.inspectContainer(workspaceContainerName(record));
  const logicalKey = resourceKeyForProject(record.projectId);
  if (found || !record.containerId || workspacePhysicalKey(record) === logicalKey) return found;
  // Pre-hot allocations used logical names. Only their exact persisted container is trusted.
  const legacy = await docker.inspectContainer(`evcp-ws-${logicalKey}`);
  return legacy?.containerId === record.containerId ? legacy : null;
}
