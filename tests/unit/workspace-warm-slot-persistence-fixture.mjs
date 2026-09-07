import { createWarmPreparationPersistenceModel } from "./workspace-warm-preparation-persistence-fixture.mjs";

export class DeterministicWarmSlotPersistenceClient {
  workspaceWarmPreparation = createWarmPreparationPersistenceModel();
  rows = new Map();
  claimQueries = [];
  executedStatements = [];
  waitingQueries = [];
  afterMutation = async () => {};

  workspaceWarmSlot = {
    findMany: async () => [...this.rows.values()].sort(byCreatedAt).map(cloneRow),
    count: async ({ where }) =>
      [...this.rows.values()].filter((row) => where.state.in.includes(row.state)).length,
    create: async ({ data }) => {
      const now = new Date("2026-09-05T00:00:00.000Z");
      const row = {
        ...data,
        state: "preparing",
        containerId: null,
        llmGatewayKeyId: null,
        secretPayload: null,
        claimProjectId: null,
        operationOwner: data.operationOwner ?? null,
        operationExpiresAt: data.operationExpiresAt ?? null,
        lastError: null,
        retryAfter: null,
        failureCount: 0,
        readyAt: null,
        claimedAt: null,
        createdAt: now,
        updatedAt: now
      };
      this.rows.set(row.id, row);
      return cloneRow(row);
    },
    update: async ({ where, data }) => {
      const row = this.rows.get(where.id);
      if (!row) throw new Error(`unknown warm slot '${where.id}'`);
      Object.assign(row, data, { updatedAt: new Date("2026-09-05T00:00:01.000Z") });
      return cloneRow(row);
    },
    updateMany: async (args) => {
      const row = this.mutate(args);
      if (row) await this.afterMutation(args, row);
      return { count: row ? 1 : 0 };
    },
    updateManyAndReturn: async (args) => {
      // PostgreSQL UPDATE ... RETURNING captures the row in the same statement as the CAS.
      const row = this.mutate(args);
      if (row) await this.afterMutation(args, row);
      return row ? [row] : [];
    },
    findUnique: async ({ where }) => cloneRow(this.rows.get(where.id) ?? null),
    deleteMany: async ({ where }) => {
      const row = this.rows.get(where.id);
      if (!row || (where.operationOwner && row.operationOwner !== where.operationOwner)) {
        return { count: 0 };
      }
      this.rows.delete(where.id);
      return { count: 1 };
    }
  };

  mutate({ where, data }) {
    const row = this.rows.get(where.id);
    if (!matchesWhere(row, where)) return null;
    Object.assign(row, data, { updatedAt: new Date("2026-09-05T00:00:02.000Z") });
    return cloneRow(row);
  }

  async $queryRawUnsafe(query) {
    this.claimQueries.push(query);
    const candidate = [...this.rows.values()]
      .filter((row) => row.state === "ready")
      .sort(byCreatedAt)[0];
    const result = candidate ? [{ id: candidate.id }] : [];
    if (candidate && this.claimQueries.length <= 2) {
      await new Promise((resolve) => {
        this.waitingQueries.push(resolve);
        if (this.waitingQueries.length === 2) {
          for (const release of this.waitingQueries.splice(0)) release();
        }
      });
    }
    return result;
  }

  async $executeRawUnsafe(statement) {
    this.executedStatements.push(statement);
    return 0;
  }

  async $transaction(operation) {
    return operation(this);
  }
}

export class AtomicCapacityPersistenceClient extends DeterministicWarmSlotPersistenceClient {
  transactionTail = Promise.resolve();

  async $transaction(operation) {
    const previous = this.transactionTail;
    let release;
    this.transactionTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation(this);
    } finally {
      release();
    }
  }
}

function byCreatedAt(left, right) {
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function cloneRow(row) {
  return row === null ? null : structuredClone(row);
}

function matchesWhere(row, where) {
  if (!row) return false;
  if (where.resourceKey !== undefined && row.resourceKey !== where.resourceKey) return false;
  if (where.state && row.state !== where.state) return false;
  if (where.operationOwner && row.operationOwner !== where.operationOwner) return false;
  if (where.operationExpiresAt?.gt && !(row.operationExpiresAt > where.operationExpiresAt.gt)) {
    return false;
  }
  if (where.OR) {
    return where.OR.some((condition) =>
      condition.operationExpiresAt === null
        ? row.operationExpiresAt === null
        : row.operationExpiresAt <= condition.operationExpiresAt.lte
    );
  }
  return true;
}
