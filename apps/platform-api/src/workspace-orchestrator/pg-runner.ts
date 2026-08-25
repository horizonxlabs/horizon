import { Client } from "pg";

// Re-exported so callers outside apps/platform-api (e.g. root-level integration tests)
// can construct an admin Client without needing `pg` resolvable from their own directory
// (pnpm's isolated node_modules only installs `pg` under apps/platform-api).
export { Client };

export interface PgRunSqlOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

/**
 * Returns a runSql function that executes a single SQL statement against Postgres,
 * opening and closing a fresh Client per call. Errors propagate so the orchestrator's
 * provision rollback can fire. Never logs the SQL (it may embed a generated role password).
 */
export function createPgRunSql(opts: PgRunSqlOptions): (sql: string) => Promise<void> {
  const config = opts.connectionString
    ? { connectionString: opts.connectionString }
    : {
        host: opts.host,
        port: opts.port,
        user: opts.user,
        password: opts.password,
        database: opts.database
      };

  return async (sql: string): Promise<void> => {
    const client = new Client(config);
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  };
}

export interface PgQueryField {
  name: string;
  dataTypeID: number;
}

export interface PgQueryResult {
  rows: Record<string, unknown>[];
  fields: PgQueryField[];
  rowCount: number;
}

export type PgTransaction = <T>(
  operation: (query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>) => Promise<T>
) => Promise<T>;

/** Runs every callback query on one checked-out connection under an explicit transaction. */
export function createPgTransaction(opts: PgRunSqlOptions): PgTransaction {
  const config = opts.connectionString
    ? { connectionString: opts.connectionString }
    : {
        host: opts.host,
        port: opts.port,
        user: opts.user,
        password: opts.password,
        database: opts.database
      };
  return async <T>(operation: (
    query: (sql: string, params?: unknown[]) => Promise<PgQueryResult>
  ) => Promise<T>): Promise<T> => {
    const client = new Client(config);
    await client.connect();
    const query = async (sql: string, params: unknown[] = []): Promise<PgQueryResult> => {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as Record<string, unknown>[],
        fields: (result.fields ?? []).map((field) => ({
          name: field.name,
          dataTypeID: field.dataTypeID
        })),
        rowCount: result.rowCount ?? result.rows.length
      };
    };
    try {
      await client.query("BEGIN");
      const result = await operation(query);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  };
}

/**
 * Like createPgRunSql but returns rows/fields, and accepts bound parameters ($1, $2, …).
 * Used by the project database browser to run parameterized (never string-interpolated)
 * statements against the caller-supplied connection — which MUST be the per-project scoped
 * role so Postgres itself enforces schema isolation. Opens/closes a fresh Client per call.
 */
export function createPgQuery(
  opts: PgRunSqlOptions
): (sql: string, params?: unknown[]) => Promise<PgQueryResult> {
  const config = opts.connectionString
    ? { connectionString: opts.connectionString }
    : {
        host: opts.host,
        port: opts.port,
        user: opts.user,
        password: opts.password,
        database: opts.database
      };

  return async (sql: string, params: unknown[] = []): Promise<PgQueryResult> => {
    const client = new Client(config);
    await client.connect();
    try {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as Record<string, unknown>[],
        fields: (result.fields ?? []).map((field) => ({
          name: field.name,
          dataTypeID: field.dataTypeID
        })),
        rowCount: result.rowCount ?? result.rows.length
      };
    } finally {
      await client.end();
    }
  };
}
