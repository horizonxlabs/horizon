import { createPgQuery } from "./pg-runner";

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
}

export interface SecretPersistence {
  loadAll(): Promise<StoredSecretRow[]>;
  upsert(row: StoredSecretRow): Promise<void>;
  deleteAll(projectId: string): Promise<void>;
}

export function createPgSecretPersistence(connectionString: string): SecretPersistence {
  const query = createPgQuery({ connectionString });
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
    ).then(() => undefined);
    return ready;
  };

  return {
    async loadAll() {
      await ensureTable();
      const result = await query(
        `SELECT project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at FROM project_secrets`
      );
      return result.rows.map((row) => ({
        projectId: String(row.project_id),
        name: String(row.name),
        ciphertext: String(row.ciphertext),
        iv: String(row.iv),
        authTag: String(row.auth_tag),
        rotatedAt: row.rotated_at ? new Date(row.rotated_at as string).toISOString() : null,
        createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString()
      }));
    },
    async upsert(row) {
      await ensureTable();
      await query(
        `INSERT INTO project_secrets (project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_id, name)
         DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
                       auth_tag = EXCLUDED.auth_tag, rotated_at = EXCLUDED.rotated_at`,
        [row.projectId, row.name, row.ciphertext, row.iv, row.authTag, row.rotatedAt, row.createdAt]
      );
    },
    async deleteAll(projectId) {
      await ensureTable();
      await query(`DELETE FROM project_secrets WHERE project_id = $1`, [projectId]);
    }
  };
}
