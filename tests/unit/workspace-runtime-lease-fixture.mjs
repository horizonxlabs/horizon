import { WorkspaceRuntimeRepositoryBackedStore } from "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts";

export function createRuntimeLeaseFixture() {
  const records = new Map();
  const leases = new Map();
  const missingProjects = new Set();
  const lifecycleStates = new Map();
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
      if (sql.includes("INSERT INTO project_lifecycle_states")) {
        if (!lifecycleStates.has(projectId)) lifecycleStates.set(projectId, { status: "active", epoch: 0, mutation_epoch: 0 });
        return 1;
      }
      const current = leases.get(projectId);
      if (sql.trimStart().startsWith("INSERT INTO")) {
        if (missingProjects.has(projectId)) {
          throw Object.assign(
            new Error(
              'insert or update on table "workspace_provisioning_leases" violates foreign key constraint "workspace_provisioning_leases_project_id_fkey"'
            ),
            {
              code: "P2010",
              meta: {
                code: "23503",
                message:
                  'Key (project_id) is not present in table "projects"; constraint "workspace_provisioning_leases_project_id_fkey"'
              }
            }
          );
        }
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
      if (sql.includes('FROM "projects"')) return [{ present: !missingProjects.has(projectId) }];
      if (sql.includes("FROM project_lifecycle_states")) return [lifecycleStates.get(projectId)];
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
    lifecycleStates,
    client,
    get now() {
      return now;
    },
    advance(ms) {
      now += ms;
    },
    deleteProject(projectId) {
      missingProjects.add(projectId);
      leases.delete(projectId);
      records.delete(projectId);
    },
    createStore: () => new WorkspaceRuntimeRepositoryBackedStore(client)
  };
}
