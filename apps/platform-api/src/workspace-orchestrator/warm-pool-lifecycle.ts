import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceWarmPool, WarmPoolStatus } from "./warm-pool";
import type { WorkspaceRuntimeCache } from "./runtime-cache";
import { physicalResourceKey } from "./warm-pool-config";
import { cleanupOrphanWorkspaceResources } from "./workspace-lifecycle";
import { createOrphanProjectCleanup } from "./orphan-project-cleanup";

export function createWarmPoolLifecycle(
  deps: WorkspaceOrchestratorDeps,
  cache: WorkspaceRuntimeCache,
  llmKeyIds: Map<string, string>
) {
  const records = cache.records;
  const cleanupProject = createOrphanProjectCleanup(deps, records);
  return {
    configureWarmPool(pool: WorkspaceWarmPool): void {
      deps.warmPool = pool;
    },
    async reconcileWarmPool(): Promise<void> {
      await deps.warmPool?.reconcile((projectId) => {
        const publication = cache.capture(projectId);
        return {
          publish(snapshot) {
            if (publication.publish(snapshot.record) && snapshot.llmGatewayKeyId)
              llmKeyIds.set(projectId, snapshot.llmGatewayKeyId);
          },
          release: publication.release
        };
      });
    },
    async ensureWarmPoolCapacity(): Promise<void> {
      await deps.warmPool?.ensureCapacity();
    },
    async getWarmPoolStatus(): Promise<WarmPoolStatus> {
      return (
        deps.warmPool?.getStatus() ?? {
          target: 0,
          preparing: 0,
          ready: 0,
          claiming: 0,
          failed: 0,
          staleImage: 0
        }
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
        isWarmResourceOwned: (key) => deps.warmPool?.isResourceOwned(key) ?? Promise.resolve(true),
        activeResourceKeys: new Set(activeRecords.map(physicalResourceKey)),
        cleanupProject,
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
