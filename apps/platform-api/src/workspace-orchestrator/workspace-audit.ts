import type { WorkspaceAuditEvent } from "./orchestrator-types";

export function workspaceAuditRecord(event: WorkspaceAuditEvent) {
  return {
    actorId: "system",
    action: event.action,
    resourceType: "workspace_container",
    resourceId: event.projectId,
    metadata: event.metadata
  };
}
