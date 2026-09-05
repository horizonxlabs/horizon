import type {
  WarmPreparationIntent,
  WarmPreparationIntentStore
} from "../workspace-orchestrator/warm-pool-types";

export interface WorkspaceWarmPreparationPersistenceClient {
  workspaceWarmPreparation: {
    findMany(): Promise<WarmPreparationIntent[]>;
    create(args: { data: Omit<WarmPreparationIntent, "settled"> }): Promise<unknown>;
    updateMany(args: {
      where: { resourceKey: string };
      data: { settled: true };
    }): Promise<{ count: number }>;
    deleteMany(args: { where: { resourceKey: string } }): Promise<{ count: number }>;
  };
}

export function createWarmPreparationIntentStore(
  client: WorkspaceWarmPreparationPersistenceClient
): WarmPreparationIntentStore {
  return {
    async list() {
      return (await client.workspaceWarmPreparation.findMany()).map(
        ({ resourceKey, slotId, operationOwner, settled }) => ({
          resourceKey,
          slotId,
          operationOwner,
          settled
        })
      );
    },
    async create(intent) {
      await client.workspaceWarmPreparation.create({ data: intent });
    },
    async settle(resourceKey) {
      await client.workspaceWarmPreparation.updateMany({
        where: { resourceKey },
        data: { settled: true }
      });
    },
    async remove(resourceKey) {
      await client.workspaceWarmPreparation.deleteMany({ where: { resourceKey } });
    }
  };
}
