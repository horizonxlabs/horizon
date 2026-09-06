import { randomUUID } from "node:crypto";
import { ProjectDeletionInProgressError, type ProjectDeletionFence } from "../project-lifecycle";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import { resolveWorkspaceProvisioningLeases } from "./provisioning-lease";
import { maintainWorkspaceCleanupProjectLease } from "./warm-pool-operation-lease";

/** The outer delete owns this lease until ALL external cleanup and the project cascade finish. */
export async function runWorkspaceProjectDeletion<T>(
  deps: WorkspaceOrchestratorDeps,
  projectId: string,
  fence: ProjectDeletionFence | undefined,
  operation: (fence: ProjectDeletionFence) => Promise<T>
): Promise<T> {
  const leases = resolveWorkspaceProvisioningLeases(deps.runtimeRecords, deps.docker);
  const token = randomUUID();
  const leaseMs = 5 * 60_000;
  const authority = fence?.ownerId ? { ownerId: fence.ownerId, epoch: fence.epoch } : undefined;
  let acquisition;
  do {
    await fence?.assertCurrent();
    acquisition = await leases.acquire(projectId, token, leaseMs, authority);
    if (acquisition === "contended") await new Promise((resolve) => setTimeout(resolve, 25));
  } while (acquisition === "contended");
  if (acquisition !== "acquired") throw new ProjectDeletionInProgressError(projectId);
  const ownership = maintainWorkspaceCleanupProjectLease({ leases, projectId, token, leaseMs });
  try {
    return await operation({
      epoch: fence?.epoch ?? 0,
      ownerId: fence?.ownerId,
      workspaceToken: token,
      async assertCurrent() {
        await fence?.assertCurrent();
        await ownership.assertOwned();
      }
    });
  } finally {
    ownership.stop();
    await leases.release(projectId, token).catch(() => undefined);
  }
}
