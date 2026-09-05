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
  }
): Promise<void> {
  await orchestrator.hydrateRuntimeRecords(await persistence.createRuntimeRecordStore(databaseUrl));
  if (poolFactory) {
    orchestrator.configureWarmPool(poolFactory(await persistence.createWarmSlotStore(databaseUrl)));
  }
  await orchestrator.recoverWarmClaims();
  await orchestrator.reconcileWarmPool();
  await orchestrator.cleanupOrphanContainers();
  void orchestrator.ensureWarmPoolCapacity().catch(() => undefined);
}
