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
    await orchestrator.cleanupOrphanContainers();
    await orchestrator.ensureWarmPoolCapacity();
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
