import type { WorkspaceContainerRecord } from "@evcp/types";
import { resourceKeyForProject } from "./resource-ports";

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
