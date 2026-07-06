import type { WorkspaceState } from "@evcp/types";

export class WorkspaceStateError extends Error {}

const TRANSITIONS: Record<WorkspaceState, WorkspaceState[]> = {
  provisioning: ["running", "failed"],
  running: ["idle", "archived", "failed"],
  idle: ["running", "archived"],
  archived: [],
  failed: [],
};

export function canTransition(from: WorkspaceState, to: WorkspaceState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: WorkspaceState, to: WorkspaceState): void {
  if (!canTransition(from, to)) {
    throw new WorkspaceStateError(`invalid workspace transition from '${from}' to '${to}'`);
  }
}
