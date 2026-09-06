import { randomUUID } from "node:crypto";
import type { WorkspaceOrchestratorDeps, WorkspaceContainerRecord } from "./orchestrator-types";
import type { ProjectOrphanCleanup } from "./workspace-lifecycle";
import { resolveWorkspaceProvisioningLeases } from "./provisioning-lease";
import { maintainWorkspaceCleanupProjectLease } from "./warm-pool-operation-lease";

/** Static inventory is only a hint; project deletion requires a fresh leased ownership check. */
export function createOrphanProjectCleanup(
  deps: WorkspaceOrchestratorDeps,
  records: ReadonlyMap<string, WorkspaceContainerRecord>
): ProjectOrphanCleanup {
  return async (projectId, cleanup) => {
    const leases = resolveWorkspaceProvisioningLeases(deps.runtimeRecords, deps.docker);
    const token = randomUUID();
    const leaseMs = 5 * 60_000;
    const acquisition = await leases.acquire(projectId, token, leaseMs);
    if (acquisition === "contended") return;
    const ownership =
      acquisition === "acquired"
        ? maintainWorkspaceCleanupProjectLease({ leases, projectId, token, leaseMs })
        : undefined;
    try {
      const assigned = deps.runtimeRecords
        ? (await deps.runtimeRecords.list()).some(({ record }) => record.projectId === projectId)
        : records.has(projectId);
      const claimed = (await deps.warmPool?.getClaimProjectIds())?.has(projectId) ?? false;
      if (assigned || claimed) return;
      // Only exact missing-project acquisition permits cleanup without a live project lease.
      await cleanup(ownership?.assertOwned ?? (async () => {}));
    } finally {
      ownership?.stop();
      if (acquisition === "acquired") await leases.release(projectId, token).catch(() => undefined);
    }
  };
}
