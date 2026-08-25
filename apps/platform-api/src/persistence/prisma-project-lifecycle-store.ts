import type { DeletionLeaseResult, ProjectLifecycleStore } from "../project-lifecycle-store";

type QueryClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export type PrismaProjectLifecycleClient = QueryClient & {
  $transaction<T>(operation: (client: QueryClient) => Promise<T>): Promise<T>;
};

type LifecycleRow = {
  status: "active" | "deleting" | "deleted";
  epoch: number;
  mutation_epoch: number;
  deletion_owner_id: string | null;
  deletion_lease_current: boolean;
};

async function lockState(client: QueryClient, projectId: string): Promise<LifecycleRow> {
  await client.$executeRawUnsafe(
    `INSERT INTO project_lifecycle_states
       (project_id, status, epoch, mutation_epoch, updated_at)
     VALUES ($1, 'active', 0, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (project_id) DO NOTHING`,
    projectId
  );
  const rows = await client.$queryRawUnsafe<LifecycleRow[]>(
    `SELECT status, epoch, mutation_epoch, deletion_owner_id,
            COALESCE(deletion_lease_expires_at > CURRENT_TIMESTAMP, false)
              AS deletion_lease_current
     FROM project_lifecycle_states WHERE project_id = $1 FOR UPDATE`,
    projectId
  );
  if (!rows[0]) throw new Error(`Missing lifecycle state for project '${projectId}'`);
  return rows[0];
}

async function exists(client: QueryClient, query: string, values: unknown[]): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ valid: boolean }>>(query, ...values);
  return rows[0]?.valid === true;
}

export function createPrismaProjectLifecycleStore(
  client: PrismaProjectLifecycleClient
): ProjectLifecycleStore {
  return {
    async acquireMutationLease({ projectId, leaseId, durationMs }) {
      return client.$transaction(async (transaction) => {
        const state = await lockState(transaction, projectId);
        if (state.status !== "active") return { acquired: false };
        const epoch = state.mutation_epoch + 1;
        await transaction.$executeRawUnsafe(
          `UPDATE project_lifecycle_states SET mutation_epoch = $2,
             updated_at = CURRENT_TIMESTAMP WHERE project_id = $1`,
          projectId,
          epoch
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO project_mutation_leases
             (id, project_id, epoch, expires_at, created_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP + $4 * INTERVAL '1 millisecond',
                   CURRENT_TIMESTAMP)`,
          leaseId,
          projectId,
          epoch,
          durationMs
        );
        return { acquired: true, epoch };
      });
    },
    async renewMutationLease(leaseId, epoch, durationMs) {
      const updated = await client.$executeRawUnsafe(
        `UPDATE project_mutation_leases
         SET expires_at = CURRENT_TIMESTAMP + $3 * INTERVAL '1 millisecond'
         WHERE id = $1 AND epoch = $2 AND expires_at > CURRENT_TIMESTAMP`,
        leaseId,
        epoch,
        durationMs
      );
      return updated > 0;
    },
    async releaseMutationLease(leaseId, epoch) {
      await client.$executeRawUnsafe(
        "DELETE FROM project_mutation_leases WHERE id = $1 AND epoch = $2",
        leaseId,
        epoch
      );
    },
    async getMutationDrainDelay(projectId) {
      return client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "DELETE FROM project_mutation_leases WHERE project_id = $1 AND expires_at <= CURRENT_TIMESTAMP",
          projectId
        );
        const rows = await transaction.$queryRawUnsafe<Array<{ delay_ms: number | null }>>(
          `SELECT CEIL(EXTRACT(EPOCH FROM (MIN(expires_at) - CURRENT_TIMESTAMP)) * 1000)::integer
             AS delay_ms
           FROM project_mutation_leases WHERE project_id = $1`,
          projectId
        );
        return rows[0]?.delay_ms ?? null;
      });
    },
    async assertMutationLease(projectId, leaseId, epoch) {
      return exists(
        client,
        `SELECT EXISTS(
           SELECT 1 FROM project_mutation_leases
           WHERE id = $1 AND project_id = $2 AND epoch = $3
             AND expires_at > CURRENT_TIMESTAMP
         ) AS valid`,
        [leaseId, projectId, epoch]
      );
    },
    async beginDeletion({ projectId, ownerId, durationMs }) {
      return client.$transaction(async (transaction): Promise<DeletionLeaseResult> => {
        const state = await lockState(transaction, projectId);
        if (state.status === "deleted") return { status: "deleted" };
        if (
          state.status === "deleting" && state.deletion_owner_id !== null &&
          state.deletion_owner_id !== ownerId && state.deletion_lease_current
        ) return { status: "busy" };
        const epoch = state.epoch + 1;
        await transaction.$executeRawUnsafe(
          `UPDATE project_lifecycle_states
           SET status = 'deleting', epoch = $2, deletion_owner_id = $3,
               deletion_lease_expires_at = CURRENT_TIMESTAMP + $4 * INTERVAL '1 millisecond',
               updated_at = CURRENT_TIMESTAMP WHERE project_id = $1`,
          projectId,
          epoch,
          ownerId,
          durationMs
        );
        return { status: "acquired", epoch };
      });
    },
    async renewDeletionLease(projectId, ownerId, epoch, durationMs) {
      const updated = await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states
         SET deletion_lease_expires_at = CURRENT_TIMESTAMP + $4 * INTERVAL '1 millisecond',
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND status = 'deleting' AND deletion_owner_id = $2
           AND epoch = $3 AND deletion_lease_expires_at > CURRENT_TIMESTAMP`,
        projectId,
        ownerId,
        epoch,
        durationMs
      );
      return updated > 0;
    },
    async assertDeletionLease(projectId, ownerId, epoch) {
      return exists(
        client,
        `SELECT EXISTS(
           SELECT 1 FROM project_lifecycle_states
           WHERE project_id = $1 AND status = 'deleting' AND deletion_owner_id = $2
             AND epoch = $3 AND deletion_lease_expires_at > CURRENT_TIMESTAMP
         ) AS valid`,
        [projectId, ownerId, epoch]
      );
    },
    async completeDeletion(projectId, ownerId, epoch) {
      const updated = await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states
         SET status = 'deleted', deletion_owner_id = NULL,
             deletion_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND deletion_owner_id = $2 AND epoch = $3
           AND deletion_lease_expires_at > CURRENT_TIMESTAMP`,
        projectId,
        ownerId,
        epoch
      );
      return updated > 0;
    },
    async abandonDeletion(projectId, ownerId, epoch) {
      await client.$executeRawUnsafe(
        `UPDATE project_lifecycle_states
         SET deletion_owner_id = NULL, deletion_lease_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND status = 'deleting' AND deletion_owner_id = $2
           AND epoch = $3`,
        projectId,
        ownerId,
        epoch
      );
    }
  };
}
