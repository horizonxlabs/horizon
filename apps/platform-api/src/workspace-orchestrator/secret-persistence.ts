import {
  createPgQuery,
  createPgTransaction,
  type PgTransaction,
  type PgQueryResult
} from "./pg-runner";

// At-rest persistence for the per-project secret store. Only ciphertext (AES-256-GCM, encrypted
// with EVCP_WORKSPACE_SECRET_KEY) is stored — plaintext never touches the database. This is what
// lets a platform-api restart re-hydrate the per-project DATABASE_URL (and other) secrets instead
// of orphaning the containers' credentials in memory.

export interface StoredSecretRow {
  projectId: string;
  name: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  rotatedAt: string | null;
  createdAt: string;
  provisioningToken?: string | null;
}

export interface SecretPersistence {
  loadAll(): Promise<StoredSecretRow[]>;
  upsert(row: StoredSecretRow): Promise<void>;
  deleteAll(projectId: string): Promise<void>;
  replaceProvisioning?(projectId: string, token: string, rows: StoredSecretRow[]): Promise<boolean>;
  deleteProvisioning?(projectId: string, token: string): Promise<void>;
  adoptProvisioning?(projectId: string, token: string, names: string[]): Promise<boolean>;
  repairProvisioning?(
    projectId: string,
    token: string,
    rows: StoredSecretRow[],
    expected: StoredSecretRow[]
  ): Promise<boolean>;
}

export function createPgSecretPersistence(connectionString: string): SecretPersistence {
  return createSqlSecretPersistence(
    createPgQuery({ connectionString }),
    createPgTransaction({ connectionString })
  );
}

export function createSqlSecretPersistence(
  query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>,
  transaction: PgTransaction
): SecretPersistence {
  let ready: Promise<void> | undefined;

  const ensureTable = () => {
    ready ??= query(
      `CREATE TABLE IF NOT EXISTS project_secrets (
         project_id text NOT NULL,
         name       text NOT NULL,
         ciphertext text NOT NULL,
         iv         text NOT NULL,
         auth_tag   text NOT NULL,
         rotated_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (project_id, name)
       )`
    )
      .then(() =>
        query("ALTER TABLE project_secrets ADD COLUMN IF NOT EXISTS provisioning_token text")
      )
      .then(() => undefined);
    return ready;
  };

  return {
    async loadAll() {
      await ensureTable();
      const result = await query(
        `SELECT project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at, provisioning_token FROM project_secrets`
      );
      return result.rows.map((row) => ({
        projectId: String(row.project_id),
        name: String(row.name),
        ciphertext: String(row.ciphertext),
        iv: String(row.iv),
        authTag: String(row.auth_tag),
        rotatedAt: row.rotated_at ? new Date(row.rotated_at as string).toISOString() : null,
        createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString(),
        provisioningToken: row.provisioning_token ? String(row.provisioning_token) : null
      }));
    },
    async upsert(row) {
      await ensureTable();
      await query(
        `INSERT INTO project_secrets (project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_id, name)
         DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
                       auth_tag = EXCLUDED.auth_tag, rotated_at = EXCLUDED.rotated_at,
                       provisioning_token = NULL`,
        [row.projectId, row.name, row.ciphertext, row.iv, row.authTag, row.rotatedAt, row.createdAt]
      );
    },
    async deleteAll(projectId) {
      await ensureTable();
      await query(`DELETE FROM project_secrets WHERE project_id = $1`, [projectId]);
    },
    async replaceProvisioning(projectId, token, rows) {
      if (rows.some((row) => row.projectId !== projectId))
        throw new Error("secret attempt project mismatch");
      await ensureTable();
      return transaction(async (execute) => {
        const lease = await execute(
          `SELECT token FROM workspace_provisioning_leases
           WHERE project_id = $1 AND token = $2 AND expires_at > clock_timestamp()
           FOR UPDATE`,
          [projectId, token]
        );
        if (lease.rowCount !== 1) return false;
        for (const row of rows) {
          await execute(
            `INSERT INTO project_secrets (project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at, provisioning_token)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (project_id, name) DO UPDATE
             SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag,
                 rotated_at = EXCLUDED.rotated_at, provisioning_token = EXCLUDED.provisioning_token`,
            [
              projectId,
              row.name,
              row.ciphertext,
              row.iv,
              row.authTag,
              row.rotatedAt,
              row.createdAt,
              token
            ]
          );
        }
        return true;
      });
    },
    async repairProvisioning(projectId, token, rows, expected) {
      if ([...rows, ...expected].some((row) => row.projectId !== projectId))
        throw new Error("secret repair project mismatch");
      await ensureTable();
      return transaction(async (execute) => {
        const lease = await execute(
          `SELECT token FROM workspace_provisioning_leases
           WHERE project_id = $1 AND token = $2 AND expires_at > clock_timestamp() FOR UPDATE`,
          [projectId, token]
        );
        if (lease.rowCount !== 1) return false;
        const current = await execute(
          `SELECT name, ciphertext, iv, auth_tag FROM project_secrets
           WHERE project_id = $1 AND name = ANY($2::text[]) FOR UPDATE`,
          [projectId, rows.map((row) => row.name)]
        );
        if (
          current.rows.length !== expected.length ||
          !current.rows.every((row) =>
            expected.some(
              (prior) =>
                prior.name === row.name &&
                prior.ciphertext === row.ciphertext &&
                prior.iv === row.iv &&
                prior.authTag === row.auth_tag
            )
          )
        )
          return false;
        for (const row of rows) {
          if (current.rows.some((prior) => prior.name === row.name)) continue;
          const inserted = await execute(
            `INSERT INTO project_secrets (project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at, provisioning_token)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (project_id, name) DO NOTHING RETURNING name`,
            [
              projectId,
              row.name,
              row.ciphertext,
              row.iv,
              row.authTag,
              row.rotatedAt,
              row.createdAt,
              token
            ]
          );
          // A concurrent insert into a previously missing name must roll back the entire repair.
          if (inserted.rowCount !== 1) throw new Error("managed secrets changed during repair");
        }
        return true;
      });
    },
    async adoptProvisioning(projectId, token, names) {
      await ensureTable();
      return transaction(async (execute) => {
        const lease = await execute(
          `SELECT token FROM workspace_provisioning_leases
           WHERE project_id = $1 AND token = $2 AND expires_at > clock_timestamp()
           FOR UPDATE`,
          [projectId, token]
        );
        if (lease.rowCount !== 1) return false;
        await execute(
          `UPDATE project_secrets SET provisioning_token = $2 WHERE project_id = $1 AND name = ANY($3::text[])`,
          [projectId, token, names]
        );
        return true;
      });
    },
    async deleteProvisioning(projectId, token) {
      await ensureTable();
      await query(`DELETE FROM project_secrets WHERE project_id = $1 AND provisioning_token = $2`, [
        projectId,
        token
      ]);
    }
  };
}
