import { createPgRunSql } from "../workspace-orchestrator/pg-runner";

export interface MigrationRunner {
  run(databaseUrl: string, sql: string): Promise<void>;
}

// Executes a generated <action type="migration"> SQL statement against the project's own
// Postgres database, using the container's DATABASE_URL (which authenticates as the per-project
// role and targets the per-project schema). node-pg ignores the Prisma-style `?schema=` query
// param, so we set search_path explicitly to ensure objects land in the project schema (and are
// owned by the project role, so the running app can read/write them). Never logs the SQL/URL.
export function createPgMigrationRunner(): MigrationRunner {
  return {
    async run(databaseUrl: string, sql: string): Promise<void> {
      let schema: string | null = null;
      try {
        schema = new URL(databaseUrl).searchParams.get("schema");
      } catch {
        schema = null;
      }
      const runSql = createPgRunSql({ connectionString: databaseUrl });
      const scoped = schema ? `SET search_path TO "${schema.replace(/"/g, "")}"; ${sql}` : sql;
      await runSql(scoped);
    }
  };
}
