import type {
  WarmWorkspaceSlot,
  WarmWorkspaceSlotState,
  WarmSlotOperationLease,
  WorkspaceWarmSlotStore
} from "../workspace-orchestrator/warm-pool-types";

type WarmSlotRecord = Omit<
  WarmWorkspaceSlot,
  | "state"
  | "retryAfter"
  | "operationExpiresAt"
  | "readyAt"
  | "claimedAt"
  | "createdAt"
  | "updatedAt"
> & {
  state: string;
  retryAfter: Date | string | null;
  operationExpiresAt: Date | string | null;
  readyAt: Date | string | null;
  claimedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type WarmSlotModel = {
  findMany(args: { orderBy: { createdAt: "asc" } }): Promise<WarmSlotRecord[]>;
  count(args: {
    where: { state: { in: Array<"preparing" | "ready" | "cleaning"> } };
  }): Promise<number>;
  create(args: {
    data: {
      id: string;
      resourceKey: string;
      state: "preparing";
      operationOwner?: string;
      operationExpiresAt?: Date;
    };
  }): Promise<WarmSlotRecord>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<WarmSlotRecord>;
  updateMany(args: {
    where: {
      id: string;
      state?: WarmWorkspaceSlotState;
      operationOwner?: string;
      operationExpiresAt?: { gt?: Date };
      OR?: Array<{ operationExpiresAt: null } | { operationExpiresAt: { lte: Date } }>;
    };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<WarmSlotRecord | null>;
  deleteMany(args: { where: { id: string; operationOwner?: string } }): Promise<{ count: number }>;
};

type WarmSlotTransactionClient = {
  workspaceWarmSlot: Pick<WarmSlotModel, "count" | "create" | "updateMany" | "findUnique">;
  $executeRawUnsafe(statement: string): Promise<number>;
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
  AND ("operation_expires_at" IS NULL OR "operation_expires_at" <= CURRENT_TIMESTAMP)
ORDER BY "created_at" ASC
FOR UPDATE SKIP LOCKED
LIMIT 1
`;

const RESERVE_CAPACITY_LOCK_SQL = `
SELECT pg_advisory_xact_lock(hashtextextended('evcp-workspace-warm-pool-capacity', 0))
`;

export class WorkspaceWarmSlotRepositoryBackedStore implements WorkspaceWarmSlotStore {
  constructor(private readonly client: WorkspaceWarmSlotPersistenceClient) {}

  async list(): Promise<WarmWorkspaceSlot[]> {
    return (await this.client.workspaceWarmSlot.findMany({ orderBy: { createdAt: "asc" } })).map(
      toWarmWorkspaceSlot
    );
  }

  async createPreparing(
    slot: Pick<WarmWorkspaceSlot, "id" | "resourceKey">,
    lease?: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot> {
    return toWarmWorkspaceSlot(
      await this.client.workspaceWarmSlot.create({
        data: {
          ...slot,
          state: "preparing",
          ...(lease
            ? {
                operationOwner: lease.ownerId,
                operationExpiresAt: new Date(lease.expiresAt)
              }
            : {})
        }
      })
    );
  }

  async reservePreparing(
    targetSize: number,
    candidates: Array<Pick<WarmWorkspaceSlot, "id" | "resourceKey">>,
    lease: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot[]> {
    return this.client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(RESERVE_CAPACITY_LOCK_SQL);
      const currentCapacity = await transaction.workspaceWarmSlot.count({
        where: { state: { in: ["preparing", "ready", "cleaning"] } }
      });
      const missing = Math.max(0, targetSize - currentCapacity);
      const reserved: WarmWorkspaceSlot[] = [];
      for (const candidate of candidates.slice(0, missing)) {
        reserved.push(
          toWarmWorkspaceSlot(
            await transaction.workspaceWarmSlot.create({
              data: {
                ...candidate,
                state: "preparing",
                operationOwner: lease.ownerId,
                operationExpiresAt: new Date(lease.expiresAt)
              }
            })
          )
        );
      }
      return reserved;
    });
  }

  async recordPreparedResources(
    id: string,
    patch: { llmGatewayKeyId: string; secretPayload: string },
    lease?: WarmSlotOperationLease
  ): Promise<boolean> {
    return this.updateOwned(id, patch, lease);
  }

  async recordPreparingContainer(
    id: string,
    containerId: string,
    lease?: WarmSlotOperationLease
  ): Promise<boolean> {
    return this.updateOwned(id, { containerId }, lease);
  }

  async markReady(
    id: string,
    patch: { containerId: string; llmGatewayKeyId: string; secretPayload: string },
    lease?: WarmSlotOperationLease
  ): Promise<boolean> {
    return this.updateOwned(
      id,
      {
        state: "ready",
        ...patch,
        readyAt: new Date(),
        lastError: null,
        retryAfter: null,
        operationOwner: null,
        operationExpiresAt: null
      },
      lease,
      false
    );
  }

  async markFailed(
    id: string,
    patch: { lastError: string; retryAfter: string; failureCount: number },
    lease?: WarmSlotOperationLease
  ): Promise<boolean> {
    return this.updateOwned(
      id,
      {
        ...patch,
        state: "failed",
        retryAfter: new Date(patch.retryAfter),
        ...(lease ? { operationExpiresAt: new Date(patch.retryAfter) } : {})
      },
      lease,
      false
    );
  }

  async renewOperation(id: string, lease: WarmSlotOperationLease): Promise<boolean> {
    return (
      (
        await this.client.workspaceWarmSlot.updateMany({
          where: {
            id,
            operationOwner: lease.ownerId,
            operationExpiresAt: { gt: new Date(lease.now) }
          },
          data: { operationExpiresAt: new Date(lease.expiresAt) }
        })
      ).count === 1
    );
  }

  async acquireCleanup(
    id: string,
    expectedState: WarmWorkspaceSlotState,
    lease: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot | null> {
    const acquired = await this.client.workspaceWarmSlot.updateMany({
      where: {
        id,
        state: expectedState,
        OR: [{ operationExpiresAt: null }, { operationExpiresAt: { lte: new Date(lease.now) } }]
      },
      data: {
        state: "cleaning",
        operationOwner: lease.ownerId,
        operationExpiresAt: new Date(lease.expiresAt)
      }
    });
    if (acquired.count !== 1) return null;
    const slot = await this.client.workspaceWarmSlot.findUnique({ where: { id } });
    return slot ? toWarmWorkspaceSlot(slot) : null;
  }

  async retryPreparing(id: string, lease: WarmSlotOperationLease): Promise<WarmWorkspaceSlot | null> {
    const restarted = await this.client.workspaceWarmSlot.updateMany({
      where: {
        id,
        state: "cleaning",
        operationOwner: lease.ownerId,
        operationExpiresAt: { gt: new Date(lease.now) }
      },
      data: {
        state: "preparing",
        containerId: null,
        llmGatewayKeyId: null,
        secretPayload: null,
        claimProjectId: null,
        lastError: null,
        retryAfter: null,
        operationExpiresAt: new Date(lease.expiresAt)
      }
    });
    if (restarted.count !== 1) return null;
    const slot = await this.client.workspaceWarmSlot.findUnique({ where: { id } });
    return slot ? toWarmWorkspaceSlot(slot) : null;
  }

  async claim(projectId: string): Promise<WarmWorkspaceSlot | null> {
    return this.client.$transaction(async (transaction) => {
      const candidates =
        await transaction.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_READY_SLOT_SQL);
      const candidate = candidates[0];
      if (!candidate) return null;

      const claimedAt = new Date();
      const claimed = await transaction.workspaceWarmSlot.updateMany({
        where: {
          id: candidate.id,
          state: "ready",
          OR: [{ operationExpiresAt: null }, { operationExpiresAt: { lte: claimedAt } }]
        },
        data: { state: "claiming", claimProjectId: projectId, claimedAt }
      });
      if (claimed.count !== 1) return null;

      const record = await transaction.workspaceWarmSlot.findUnique({
        where: { id: candidate.id }
      });
      return record ? toWarmWorkspaceSlot(record) : null;
    });
  }

  async remove(id: string, ownerId?: string): Promise<boolean> {
    return (
      (
        await this.client.workspaceWarmSlot.deleteMany({
          where: { id, ...(ownerId ? { operationOwner: ownerId } : {}) }
        })
      ).count === 1
    );
  }

  private async updateOwned(
    id: string,
    data: Record<string, unknown>,
    lease?: WarmSlotOperationLease,
    renew = true
  ): Promise<boolean> {
    if (!lease) {
      await this.client.workspaceWarmSlot.update({ where: { id }, data });
      return true;
    }
    return (
      (
        await this.client.workspaceWarmSlot.updateMany({
          where: {
            id,
            operationOwner: lease.ownerId,
            operationExpiresAt: { gt: new Date(lease.now) }
          },
          data: {
            ...data,
            ...(renew ? { operationExpiresAt: new Date(lease.expiresAt) } : {})
          }
        })
      ).count === 1
    );
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
    operationExpiresAt: toOptionalIso(record.operationExpiresAt),
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
