import { createPgRunSql } from "../workspace-orchestrator/pg-runner";

export interface MigrationRunner {
  run(databaseUrl: string, sql: string): Promise<void>;
  runBatch(databaseUrl: string, statements: string[]): Promise<void>;
}

const TRANSACTION_CONTROL_PATTERN =
  /\b(?:BEGIN(?:\s+(?:WORK|TRANSACTION))?|START\s+TRANSACTION|COMMIT(?:\s+(?:WORK|TRANSACTION|PREPARED))?|ROLLBACK(?:\s+(?:WORK|TRANSACTION|TO(?:\s+SAVEPOINT)?|PREPARED))?|SAVEPOINT|RELEASE\s+SAVEPOINT|PREPARE\s+TRANSACTION|END\s+(?:WORK|TRANSACTION))\b/i;

export function containsTransactionControl(statements: readonly string[]): boolean {
  return statements.some((statement) => TRANSACTION_CONTROL_PATTERN.test(statement));
}

export function buildTransactionalMigrationSql(databaseUrl: string, sql: string): string {
  let schema: string | null = null;
  try {
    schema = new URL(databaseUrl).searchParams.get("schema");
  } catch {
    schema = null;
  }
  const searchPath = schema ? `SET LOCAL search_path TO "${schema.replace(/"/g, "")}"; ` : "";
  return `BEGIN; ${searchPath}${sql}; COMMIT;`;
}

// Executes a generated <action type="migration"> SQL statement against the project's own
// Postgres database, using the container's DATABASE_URL (which authenticates as the per-project
// role and targets the per-project schema). node-pg ignores the Prisma-style `?schema=` query
// param, so we set search_path explicitly to ensure objects land in the project schema (and are
// owned by the project role, so the running app can read/write them). Never logs the SQL/URL.
export function createPgMigrationRunner(): MigrationRunner {
  const runBatch = async (databaseUrl: string, statements: string[]) => {
    const runSql = createPgRunSql({ connectionString: databaseUrl });
    await runSql(buildTransactionalMigrationSql(databaseUrl, statements.join(";\n")));
  };
  return {
    async run(databaseUrl: string, sql: string): Promise<void> {
      await runBatch(databaseUrl, [sql]);
    },
    runBatch
  };
}
