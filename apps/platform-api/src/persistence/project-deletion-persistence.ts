import type { CorePersistenceClient } from "./core-repositories";
import { ProjectDeletionInProgressError, type ProjectDeletionFence } from "../project-lifecycle";

type CascadeTransaction = {
  project: CorePersistenceClient["project"];
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};
type CascadeClient = CorePersistenceClient & {
  $transaction?: <T>(operation: (client: CascadeTransaction) => Promise<T>) => Promise<T>;
};

export async function deleteProjectCascade(
  client: CascadeClient,
  projectId: string,
  fence?: ProjectDeletionFence
): Promise<void> {
  if (!fence?.workspaceToken || !client.$transaction) {
    await fence?.assertCurrent();
    await client.project.delete({ where: { id: projectId } });
    return;
  }
  await client.$transaction(async (transaction) => {
    // Same lock order as acquisition: tombstone, workspace owner, then project cascade.
    const lifecycle = await transaction.$queryRawUnsafe<Array<{ valid: boolean }>>(
      `SELECT true AS valid FROM project_lifecycle_states
       WHERE project_id = $1 AND status = 'deleting' AND epoch = $2
         AND deletion_owner_id = $3 AND deletion_lease_expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      projectId,
      fence.epoch,
      fence.ownerId
    );
    if (!lifecycle[0]?.valid) throw new ProjectDeletionInProgressError(projectId);
    const workspace = await transaction.$queryRawUnsafe<Array<{ valid: boolean }>>(
      `SELECT true AS valid FROM workspace_provisioning_leases
       WHERE project_id = $1 AND token = $2 AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      projectId,
      fence.workspaceToken
    );
    if (!workspace[0]?.valid) throw new ProjectDeletionInProgressError(projectId);
    await transaction.project.delete({ where: { id: projectId } });
  });
}
