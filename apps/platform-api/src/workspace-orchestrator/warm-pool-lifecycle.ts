import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceWarmPool, WarmPoolStatus } from "./warm-pool";
import { physicalResourceKey } from "./warm-pool-config";
import { cleanupOrphanWorkspaceResources } from "./workspace-lifecycle";

export function createWarmPoolLifecycle(
  deps: WorkspaceOrchestratorDeps,
  records: ReadonlyMap<string, WorkspaceContainerRecord>
) {
  return {
    configureWarmPool(pool: WorkspaceWarmPool): void {
      deps.warmPool = pool;
    },
    async reconcileWarmPool(): Promise<void> {
      await deps.warmPool?.reconcile();
    },
    async ensureWarmPoolCapacity(): Promise<void> {
      await deps.warmPool?.ensureCapacity();
    },
    async getWarmPoolStatus(): Promise<WarmPoolStatus> {
      return (
        deps.warmPool?.getStatus() ?? { target: 0, preparing: 0, ready: 0, claiming: 0, failed: 0 }
      );
    },
    async cleanupOrphanContainers(): Promise<string[]> {
      return cleanupOrphanWorkspaceResources({
        docker: deps.docker,
        activeProjectIds: new Set(records.keys()),
        activeWarmSlotIds: await deps.warmPool?.getActiveSlotIds(),
        activeResourceKeys: new Set([...records.values()].map(physicalResourceKey)),
        onRemoved: ({ projectId, containerName, volumeName }) =>
          deps.onAudit?.({
            action: "workspace.orphan_removed",
            projectId,
            metadata: { containerName, volumeName }
          })
      });
    }
  };
}
