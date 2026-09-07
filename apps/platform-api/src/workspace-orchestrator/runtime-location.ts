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
