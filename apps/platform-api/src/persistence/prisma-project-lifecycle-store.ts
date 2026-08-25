import type {
  DeletionLeaseResult,
  ProjectLifecycleStore
} from "../project-lifecycle-store";

type QueryClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export type PrismaProjectLifecycleClient = QueryClient & {
  $transaction<T>(operation: (client: QueryClient) => Promise<T>): Promise<T>;
};

type LifecycleRow = {
  status: "active" | "deleting" | "deleted";
  deletion_owner_id: string | null;
  deletion_lease_expires_at: Date | null;
};

async function lockState(client: QueryClient, projectId: string): Promise<LifecycleRow> {
  await client.$executeRawUnsafe(
    `INSERT INTO project_lifecycle_states (project_id, status, updated_at)
     VALUES ($1, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT (project_id) DO NOTHING`,
    projectId
  );
  const rows = await client.$queryRawUnsafe<LifecycleRow[]>(
    `SELECT status, deletion_owner_id, deletion_lease_expires_at
     FROM project_lifecycle_states WHERE project_id = $1 FOR UPDATE`,
    projectId
  );
  if (!rows[0]) throw new Error(`Missing lifecycle state for project '${projectId}'`);
  return rows[0];
}

export function createPrismaProjectLifecycleStore(
  client: PrismaProjectLifecycleClient
): ProjectLifecycleStore {
  return {
    async acquireMutationLease({ projectId, leaseId, expiresAt }) {
      return client.$transaction(async (transaction) => {
        const state = await lockState(transaction, projectId);
        if (state.status !== "active") return false;
        await transaction.$executeRawUnsafe(
          `INSERT INTO project_mutation_leases (id, project_id, expires_at, created_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          leaseId,
          projectId,
          expiresAt
        );
        return true;
      });
    },
    async renewMutationLease(leaseId, expiresAt) {
      await client.$executeRawUnsafe(
        "UPDATE project_mutation_leases SET expires_at = $2 WHERE id = $1",
        leaseId,
        expiresAt
      );
    },
    async releaseMutationLease(leaseId) {
      await client.$executeRawUnsafe("DELETE FROM project_mutation_leases WHERE id = $1", leaseId);
    },
    async listActiveMutationLeaseExpiries(projectId, now) {
      return client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "DELETE FROM project_mutation_leases WHERE project_id = $1 AND expires_at <= $2",
          projectId,
          now
        );
        const rows = await transaction.$queryRawUnsafe<Array<{ expires_at: Date }>>(
          "SELECT expires_at FROM project_mutation_leases WHERE project_id = $1",
          projectId
        );
        return rows.map((row) => row.expires_at);
      });
    },
    async beginDeletion({ projectId, ownerId, leaseExpiresAt, now }) {
      return client.$transaction(async (transaction): Promise<DeletionLeaseResult> => {
        const state = await lockState(transaction, projectId);
        if (state.status === "deleted") return "deleted";
        const leaseIsCurrent =
          state.status === "deleting" &&
          state.deletion_owner_id !== null &&
          state.deletion_owner_id !== ownerId &&
          state.deletion_lease_expires_at !== null &&
          state.deletion_lease_expires_at > now;
        if (leaseIsCurrent) return "busy";
        await transaction.$executeRawUnsafe(
          `UPDATE project_lifecycle_states
           SET status = 'deleting', deletion_owner_id = $2,
               deletion_lease_expires_at = $3, updated_at = CURRENT_TIMESTAMP
           WHERE project_id = $1`,
          projectId,
          ownerId,
          leaseExpiresAt
        );
        return "acquired";
      });
    },
    async renewDeletionLease(projectId, ownerId, expiresAt) {
      const updated = await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states SET deletion_lease_expires_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND status = 'deleting' AND deletion_owner_id = $2`,
        projectId,
        ownerId,
        expiresAt
      );
      return updated > 0;
    },
    async completeDeletion(projectId, ownerId) {
      await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states
         SET status = 'deleted', deletion_owner_id = NULL,
             deletion_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND deletion_owner_id = $2`,
        projectId,
        ownerId
      );
    },
    async abandonDeletion(projectId, ownerId) {
      await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states
         SET deletion_owner_id = NULL, deletion_lease_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND status = 'deleting' AND deletion_owner_id = $2`,
        projectId,
        ownerId
      );
    }
  };
}
