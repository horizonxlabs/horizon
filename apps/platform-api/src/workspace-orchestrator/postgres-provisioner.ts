import { randomBytes } from "node:crypto";

// Max 60 (not 40) to accommodate the id-derived resource key `prj-<slug>`, which prefixes the slug.
const SLUG_PATTERN = /^[a-z0-9-]{3,60}$/;

export function assertValidProjectSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`invalid project slug '${slug}': must match [a-z0-9-]{3,60}`);
  }
}

export function schemaNameFor(slug: string): string {
  assertValidProjectSlug(slug);
  return `app_${slug.replaceAll("-", "_")}`;
}

export function roleNameFor(slug: string): string {
  return `${schemaNameFor(slug)}_role`;
}

export function schemaAdvisoryLockSql(schema: string): string {
  const safeSchema = schema.replace(/[^a-z0-9_]/gi, "");
  return `SELECT pg_advisory_xact_lock(hashtextextended('evcp-schema:${safeSchema}', 0))`;
}

export function buildProvisionSchemaSql(slug: string, password: string): string[] {
  const schema = schemaNameFor(slug);
  const role = roleNameFor(slug);
  if (password.includes("'")) {
    throw new Error("generated password must not contain quotes");
  }
  return [
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`,
    `CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`,
    `REVOKE ALL ON SCHEMA public FROM "${role}"`,
    `ALTER ROLE "${role}" SET search_path = "${schema}"`
  ];
}

export function buildReleaseSchemaSql(slug: string): string[] {
  const schema = schemaNameFor(slug);
  const role = roleNameFor(slug);
  return [`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, `DROP ROLE IF EXISTS "${role}"`];
}

export interface PostgresProvisioner {
  provisionSchema(
    slug: string
  ): Promise<{ schemaName: string; roleName: string; password: string }>;
  releaseSchema(slug: string): Promise<void>;
}

export function createPgClientPostgresProvisioner(
  runSql: (sql: string) => Promise<void>
): PostgresProvisioner {
  return {
    async provisionSchema(slug) {
      const password = randomBytes(24).toString("hex");
      try {
        for (const statement of buildProvisionSchemaSql(slug, password)) {
          await runSql(statement);
        }
      } catch (error) {
        for (const statement of buildReleaseSchemaSql(slug)) {
          try {
            await runSql(statement);
          } catch {
            // Preserve the original provisioning error; cleanup is best effort and idempotent.
          }
        }
        throw error;
      }
      return { schemaName: schemaNameFor(slug), roleName: roleNameFor(slug), password };
    },
    async releaseSchema(slug) {
      const schema = schemaNameFor(slug);
      await runSql(
        `BEGIN; ${schemaAdvisoryLockSql(schema)}; ${buildReleaseSchemaSql(slug).join("; ")}; COMMIT;`
      );
    }
  };
}
