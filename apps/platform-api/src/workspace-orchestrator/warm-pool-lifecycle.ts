import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceWarmPool, WarmPoolStatus } from "./warm-pool";
import { physicalResourceKey } from "./warm-pool-config";
import { cleanupOrphanWorkspaceResources } from "./workspace-lifecycle";

export function createWarmPoolLifecycle(
  deps: WorkspaceOrchestratorDeps,
  records: Map<string, WorkspaceContainerRecord>,
  llmKeyIds: Map<string, string>
) {
  return {
    configureWarmPool(pool: WorkspaceWarmPool): void {
      deps.warmPool = pool;
    },
    async recoverWarmClaims(): Promise<void> {
      for (const snapshot of (await deps.warmPool?.recoverClaims()) ?? []) {
        records.set(snapshot.record.projectId, snapshot.record);
        if (snapshot.llmGatewayKeyId)
          llmKeyIds.set(snapshot.record.projectId, snapshot.llmGatewayKeyId);
      }
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
      const claimingProjects = (await deps.warmPool?.getClaimProjectIds()) ?? [];
      const activeWarmSlotIds = await deps.warmPool?.getActiveSlotIds();
      // Read durable assignments AFTER claims: another replica can save and retire a claim
      // between startup hydration and this inventory. Both sides of that handoff must survive.
      const durableRecords = ((await deps.runtimeRecords?.list()) ?? []).map(
        ({ record }) => record
      );
      const activeRecords = [...records.values(), ...durableRecords];
      return cleanupOrphanWorkspaceResources({
        docker: deps.docker,
        activeProjectIds: new Set([
          ...claimingProjects,
          ...activeRecords.map((record) => record.projectId)
        ]),
        activeWarmSlotIds,
        activeResourceKeys: new Set(activeRecords.map(physicalResourceKey)),
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
