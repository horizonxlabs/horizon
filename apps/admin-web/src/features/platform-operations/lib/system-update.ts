import type { SystemVersionDto } from "@evcp/api-client";

// Pure helpers for the in-UI system update flow (Task 3). Kept framework-free so they are
// unit-testable without rendering; the stateful glue (polling loop, retry-through-error) lives
// in use-system-update.ts.

export type SystemUpdateStatus = "idle" | "updating" | "done" | "error";

/** How often to re-poll `getSystemVersion()` while an update is in flight. */
export const SYSTEM_UPDATE_POLL_INTERVAL_MS = 3000;

/**
 * True once every app service reports the target tag. Empty `appServices` never counts as
 * "at target" — that would otherwise be vacuously true while platform-api is still restarting
 * and the poll response has not repopulated the service list yet.
 */
export function isVersionAtTarget(version: SystemVersionDto | undefined, targetTag: string): boolean {
  if (!version || version.appServices.length === 0) return false;
  return version.appServices.every((service) => service.tag === targetTag);
}

/** Human-readable status line shown above the service table while an update runs. */
export function describeUpdateStatus(status: SystemUpdateStatus, targetTag: string | undefined, pollNote: string | undefined): string {
  if (status === "updating") {
    return pollNote ?? `Rolling out ${targetTag}. Waiting for every service to report the new tag…`;
  }
  if (status === "done") return `Updated to ${targetTag}.`;
  if (status === "error") return pollNote ?? "The update could not be started.";
  return "Idle.";
}
