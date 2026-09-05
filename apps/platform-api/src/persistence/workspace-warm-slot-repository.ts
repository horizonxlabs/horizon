import type {
  WarmWorkspaceSlot,
  WarmWorkspaceSlotState,
  WorkspaceWarmSlotStore
} from "../workspace-orchestrator/warm-pool-types";

type WarmSlotRecord = Omit<
  WarmWorkspaceSlot,
  "state" | "retryAfter" | "readyAt" | "claimedAt" | "createdAt" | "updatedAt"
> & {
  state: string;
  retryAfter: Date | string | null;
  readyAt: Date | string | null;
  claimedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type WarmSlotModel = {
  findMany(args: { orderBy: { createdAt: "asc" } }): Promise<WarmSlotRecord[]>;
  create(args: {
    data: { id: string; resourceKey: string; state: "preparing" };
  }): Promise<WarmSlotRecord>;
  update(args: {
    where: { id: string };
    data:
      | {
          state: "ready";
          containerId: string;
          llmGatewayKeyId: string;
          secretPayload: string;
          readyAt: Date;
          lastError: null;
          retryAfter: null;
        }
      | {
          state: "failed";
          lastError: string;
          retryAfter: Date;
          failureCount: number;
        };
  }): Promise<WarmSlotRecord>;
  updateMany(args: {
    where: { id: string; state: "ready" };
    data: { state: "claiming"; claimProjectId: string; claimedAt: Date };
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<WarmSlotRecord | null>;
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
};

type WarmSlotTransactionClient = {
  workspaceWarmSlot: Pick<WarmSlotModel, "updateMany" | "findUnique">;
  $queryRawUnsafe<T>(query: string): Promise<T>;
};

export interface WorkspaceWarmSlotPersistenceClient {
  workspaceWarmSlot: WarmSlotModel;
  $transaction<T>(operation: (client: WarmSlotTransactionClient) => Promise<T>): Promise<T>;
}

const CLAIM_READY_SLOT_SQL = `
SELECT "id"
FROM "workspace_warm_slots"
WHERE "state" = 'ready'
ORDER BY "created_at" ASC
FOR UPDATE SKIP LOCKED
LIMIT 1
`;

export class WorkspaceWarmSlotRepositoryBackedStore implements WorkspaceWarmSlotStore {
  constructor(private readonly client: WorkspaceWarmSlotPersistenceClient) {}

  async list(): Promise<WarmWorkspaceSlot[]> {
    return (await this.client.workspaceWarmSlot.findMany({ orderBy: { createdAt: "asc" } })).map(
      toWarmWorkspaceSlot
    );
  }

  async createPreparing(
    slot: Pick<WarmWorkspaceSlot, "id" | "resourceKey">
  ): Promise<WarmWorkspaceSlot> {
    return toWarmWorkspaceSlot(
      await this.client.workspaceWarmSlot.create({ data: { ...slot, state: "preparing" } })
    );
  }

  async markReady(
    id: string,
    patch: { containerId: string; llmGatewayKeyId: string; secretPayload: string }
  ): Promise<void> {
    await this.client.workspaceWarmSlot.update({
      where: { id },
      data: {
        state: "ready",
        ...patch,
        readyAt: new Date(),
        lastError: null,
        retryAfter: null
      }
    });
  }

  async markFailed(
    id: string,
    patch: { lastError: string; retryAfter: string; failureCount: number }
  ): Promise<void> {
    await this.client.workspaceWarmSlot.update({
      where: { id },
      data: { ...patch, state: "failed", retryAfter: new Date(patch.retryAfter) }
    });
  }

  async claim(projectId: string): Promise<WarmWorkspaceSlot | null> {
    return this.client.$transaction(async (transaction) => {
      const candidates =
        await transaction.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_READY_SLOT_SQL);
      const candidate = candidates[0];
      if (!candidate) return null;

      const claimedAt = new Date();
      const claimed = await transaction.workspaceWarmSlot.updateMany({
        where: { id: candidate.id, state: "ready" },
        data: { state: "claiming", claimProjectId: projectId, claimedAt }
      });
      if (claimed.count !== 1) return null;

      const record = await transaction.workspaceWarmSlot.findUnique({
        where: { id: candidate.id }
      });
      return record ? toWarmWorkspaceSlot(record) : null;
    });
  }

  async remove(id: string): Promise<void> {
    await this.client.workspaceWarmSlot.deleteMany({ where: { id } });
  }
}

export async function createPrismaWorkspaceWarmSlotStore(
  databaseUrl = process.env.DATABASE_URL
): Promise<WorkspaceWarmSlotStore> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as WorkspaceWarmSlotPersistenceClient;
  return new WorkspaceWarmSlotRepositoryBackedStore(client);
}

function toWarmWorkspaceSlot(record: WarmSlotRecord): WarmWorkspaceSlot {
  return {
    ...record,
    state: record.state as WarmWorkspaceSlotState,
    retryAfter: toOptionalIso(record.retryAfter),
    readyAt: toOptionalIso(record.readyAt),
    claimedAt: toOptionalIso(record.claimedAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt)
  };
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
