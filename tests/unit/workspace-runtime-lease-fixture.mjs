import { WorkspaceRuntimeRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts";

export function createRuntimeLeaseFixture() {
  const records = new Map();
  const leases = new Map();
  let now = 0;
  let tail = Promise.resolve();
  const client = {
    workspaceRuntimeRecord: {
      async findMany() {
        return [...records.values()].map((record) => structuredClone(record));
      },
      async upsert({ where, update, create }) {
        const value = records.has(where.projectId)
          ? { ...records.get(where.projectId), ...update }
          : create;
        records.set(where.projectId, structuredClone(value));
        return value;
      },
      async deleteMany({ where }) {
        return { count: Number(records.delete(where.projectId)) };
      }
    },
    async $executeRawUnsafe(sql, projectId, token, ttlMs) {
      const current = leases.get(projectId);
      if (sql.trimStart().startsWith("INSERT INTO")) {
        if (current && current.expiresAt > now) return 0;
        leases.set(projectId, { token, expiresAt: now + ttlMs });
        return 1;
      }
      if (sql.trimStart().startsWith("UPDATE")) {
        if (!current || current.token !== token || current.expiresAt <= now) return 0;
        current.expiresAt = now + ttlMs;
        return 1;
      }
      if (sql.trimStart().startsWith("DELETE FROM")) {
        if (current?.token !== token) return 0;
        leases.delete(projectId);
        return 1;
      }
      throw new Error(`unexpected lease query: ${sql}`);
    },
    async $queryRawUnsafe(sql, projectId) {
      if (!/SELECT EXISTS/.test(sql)) throw new Error(`unexpected lease query: ${sql}`);
      return [{ active: (leases.get(projectId)?.expiresAt ?? 0) > now }];
    },
    async $transaction(operation) {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation(client);
      } finally {
        release();
      }
    }
  };
  return {
    records,
    leases,
    client,
    get now() {
      return now;
    },
    advance(ms) {
      now += ms;
    },
    createStore: () => new WorkspaceRuntimeRepositoryBackedStore(client)
  };
}
