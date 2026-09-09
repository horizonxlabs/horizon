import type { WorkspaceOrchestrator } from "./orchestrator";
import type { WorkspaceWarmPoolFactory } from "./factory";
import { createPrismaWorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";
import { createPrismaWorkspaceWarmSlotStore } from "../persistence/workspace-warm-slot-repository";

export async function initializeWorkspaceRuntime(
  orchestrator: WorkspaceOrchestrator,
  databaseUrl: string | undefined,
  poolFactory?: WorkspaceWarmPoolFactory,
  persistence = {
    createRuntimeRecordStore: createPrismaWorkspaceRuntimeRecordStore,
    createWarmSlotStore: createPrismaWorkspaceWarmSlotStore
  },
  options: {
    awaitMaintenance?: boolean;
    onMaintenanceError?: (error: unknown) => void;
  } = {}
): Promise<void> {
  await orchestrator.hydrateRuntimeRecords(await persistence.createRuntimeRecordStore(databaseUrl));
  if (poolFactory) {
    orchestrator.configureWarmPool(poolFactory(await persistence.createWarmSlotStore(databaseUrl)));
  }

  const maintainRuntime = async () => {
    await orchestrator.reconcileWarmPool();
    // Restore allocatable capacity before scanning and cleaning stale project
    // resources. Orphan cleanup can include slow container health checks and must
    // not leave new projects waiting for the standby pool to be replenished.
    await orchestrator.ensureWarmPoolCapacity();
    await orchestrator.cleanupOrphanContainers();
  };
  if (options.awaitMaintenance) {
    await maintainRuntime();
    return;
  }

  // Preview health checks can take up to two minutes per stale runtime. Keep durable
  // state hydration on the startup path, but never delay API readiness on maintenance.
  void maintainRuntime().catch(
    options.onMaintenanceError ??
      ((error) => console.warn("[workspace] startup maintenance failed", error))
  );
}
