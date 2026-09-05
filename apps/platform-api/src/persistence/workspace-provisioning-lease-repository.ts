import type {
  WorkspaceRuntimePersistenceClient,
  WorkspaceRuntimeSnapshot
} from "./workspace-runtime-repository";

export interface WorkspaceProvisioningLeaseStore {
  acquire(projectId: string, token: string, ttlMs: number): Promise<boolean>;
  renew(projectId: string, token: string, ttlMs: number): Promise<boolean>;
  save(snapshot: WorkspaceRuntimeSnapshot, token: string, ttlMs: number): Promise<boolean>;
  remove(projectId: string, token: string, ttlMs: number): Promise<boolean>;
  release(projectId: string, token: string): Promise<void>;
}

interface LeaseTransactionClient {
  workspaceRuntimeRecord: WorkspaceRuntimePersistenceClient["workspaceRuntimeRecord"];
  $executeRawUnsafe(sql: string, ...parameters: unknown[]): Promise<number>;
}

export interface WorkspaceProvisioningLeaseClient extends LeaseTransactionClient {
  $transaction<T>(operation: (client: LeaseTransactionClient) => Promise<T>): Promise<T>;
}

const ACQUIRE_SQL = `
INSERT INTO "workspace_provisioning_leases" ("project_id", "token", "expires_at")
VALUES ($1, $2, CURRENT_TIMESTAMP + ($3::double precision * INTERVAL '1 millisecond'))
ON CONFLICT ("project_id") DO UPDATE SET "token" = EXCLUDED."token", "expires_at" = EXCLUDED."expires_at"
WHERE "workspace_provisioning_leases"."expires_at" <= CURRENT_TIMESTAMP
`;
const RENEW_SQL = `
UPDATE "workspace_provisioning_leases"
SET "expires_at" = CURRENT_TIMESTAMP + ($3::double precision * INTERVAL '1 millisecond')
WHERE "project_id" = $1 AND "token" = $2 AND "expires_at" > CURRENT_TIMESTAMP
`;

export class WorkspaceProvisioningLeaseRepository implements WorkspaceProvisioningLeaseStore {
  constructor(private readonly client: WorkspaceProvisioningLeaseClient) {}

  async acquire(projectId: string, token: string, ttlMs: number): Promise<boolean> {
    return (await this.client.$executeRawUnsafe(ACQUIRE_SQL, projectId, token, ttlMs)) === 1;
  }

  async renew(projectId: string, token: string, ttlMs: number): Promise<boolean> {
    return (await this.client.$executeRawUnsafe(RENEW_SQL, projectId, token, ttlMs)) === 1;
  }

  async save(snapshot: WorkspaceRuntimeSnapshot, token: string, ttlMs: number): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      // The row lock from renewal fences the runtime write against a concurrent lease takeover.
      if (
        (await transaction.$executeRawUnsafe(
          RENEW_SQL,
          snapshot.record.projectId,
          token,
          ttlMs
        )) !== 1
      )
        return false;
      const data = { ...snapshot.record, llmGatewayKeyId: snapshot.llmGatewayKeyId ?? null };
      const { id: _id, projectId: _projectId, createdAt: _createdAt, ...update } = data;
      await transaction.workspaceRuntimeRecord.upsert({
        where: { projectId: snapshot.record.projectId },
        update,
        create: data
      });
      return true;
    });
  }

  async remove(projectId: string, token: string, ttlMs: number): Promise<boolean> {
    return this.client.$transaction(async (transaction) => {
      if ((await transaction.$executeRawUnsafe(RENEW_SQL, projectId, token, ttlMs)) !== 1)
        return false;
      await transaction.workspaceRuntimeRecord.deleteMany({ where: { projectId } });
      return true;
    });
  }

  async release(projectId: string, token: string): Promise<void> {
    await this.client.$executeRawUnsafe(
      'DELETE FROM "workspace_provisioning_leases" WHERE "project_id" = $1 AND "token" = $2',
      projectId,
      token
    );
  }
}
