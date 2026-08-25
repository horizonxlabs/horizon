import { createPgQuery, createPgTransaction, type PgQueryResult,
  type PgTransaction } from "./workspace-orchestrator/pg-runner";
import type { ProjectMutationFence } from "./project-lifecycle";
import { schemaAdvisoryLockSql } from "./workspace-orchestrator/postgres-provisioner";

// Per-project database browser backend. Every query here runs through a connection built from the
// project's own scoped Postgres role (search_path pinned to the project's schema), so Postgres —
// not this code — is the boundary that keeps one project from reaching another's data. On top of
// that DB-enforced isolation we still: (1) only ever touch the project's own schema, (2) validate
// table/column names against live introspection before using them as identifiers, and
// (3) bind every value as a parameter ($1, $2, …) — never string-interpolate caller input.

export interface ProjectDbColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  ordinal: number;
}

export interface ProjectDbTable {
  name: string;
  columns: ProjectDbColumn[];
}

export interface ProjectDbSchema {
  schema: string;
  tables: ProjectDbTable[];
}

export interface ProjectDbTablePage {
  table: string;
  columns: ProjectDbColumn[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export class ProjectDbError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ProjectDbError";
  }
}

export type ProjectQueryFn = (sql: string, params?: unknown[]) => Promise<PgQueryResult>;
type QueryFn = ProjectQueryFn;

/** The per-project DATABASE_URL encodes the schema as `?schema=<name>`. */
export function schemaFromConnectionString(connectionString: string): string {
  const match = connectionString.match(/[?&]schema=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "public";
}

/** Double-quote a Postgres identifier that has already been validated against introspection. */
function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function introspectSchema(query: QueryFn, schema: string): Promise<ProjectDbSchema> {
  const result = await query(
    `SELECT c.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.ordinal_position,
            (pk.column_name IS NOT NULL) AS is_primary_key
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema
      AND t.table_name = c.table_name
      AND t.table_type = 'BASE TABLE'
     LEFT JOIN (
       SELECT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = $1
     ) pk
       ON pk.table_name = c.table_name
      AND pk.column_name = c.column_name
     WHERE c.table_schema = $1
     ORDER BY c.table_name, c.ordinal_position`,
    [schema]
  );

  const tables = new Map<string, ProjectDbTable>();
  for (const row of result.rows) {
    const tableName = String(row.table_name);
    let table = tables.get(tableName);
    if (!table) {
      table = { name: tableName, columns: [] };
      tables.set(tableName, table);
    }
    table.columns.push({
      name: String(row.column_name),
      dataType: String(row.data_type),
      nullable: row.is_nullable === "YES",
      isPrimaryKey: row.is_primary_key === true,
      ordinal: Number(row.ordinal_position)
    });
  }
  return { schema, tables: [...tables.values()] };
}

/** Resolve a table the caller named against the live schema, or throw a 404-style error. */
export function requireTable(snapshot: ProjectDbSchema, table: string): ProjectDbTable {
  const found = snapshot.tables.find((candidate) => candidate.name === table);
  if (!found) throw new ProjectDbError(`Unknown table: ${table}`, 404);
  return found;
}

export async function readTablePage(
  query: QueryFn,
  schema: string,
  table: string,
  limit: number,
  offset: number,
  snapshot?: ProjectDbSchema
): Promise<ProjectDbTablePage> {
  const snap = snapshot ?? (await introspectSchema(query, schema));
  const definition = requireTable(snap, table);
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
  const safeOffset = Math.max(0, Math.floor(offset) || 0);

  const qualified = `${quoteIdent(schema)}.${quoteIdent(definition.name)}`;
  const countResult = await query(`SELECT count(*)::int AS total FROM ${qualified}`);
  const total = Number(countResult.rows[0]?.total ?? 0);

  const primaryKey = definition.columns
    .filter((column) => column.isPrimaryKey)
    .map((column) => quoteIdent(column.name));
  const orderBy = primaryKey.length ? `ORDER BY ${primaryKey.join(", ")}` : "";

  const pageResult = await query(`SELECT * FROM ${qualified} ${orderBy} LIMIT $1 OFFSET $2`, [
    safeLimit,
    safeOffset
  ]);

  return {
    table: definition.name,
    columns: definition.columns,
    rows: pageResult.rows,
    total,
    limit: safeLimit,
    offset: safeOffset
  };
}

/** Build a scoped query function for a project from its per-project connection string. */
export function createProjectQuery(connectionString: string): QueryFn {
  return createPgQuery({ connectionString });
}

// --- Writes: structured, by primary key, every value bound as a parameter ---

function assertKnownColumns(table: ProjectDbTable, keys: string[]): void {
  const known = new Set(table.columns.map((column) => column.name));
  for (const key of keys) {
    if (!known.has(key)) throw new ProjectDbError(`Unknown column: ${key}`, 400);
  }
}

function primaryKeyColumns(table: ProjectDbTable): string[] {
  return table.columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
}

function requirePrimaryKeyValues(table: ProjectDbTable, pk: Record<string, unknown>): string[] {
  const pkColumns = primaryKeyColumns(table);
  if (pkColumns.length === 0) {
    throw new ProjectDbError(
      `Table "${table.name}" has no primary key; row edits are disabled`,
      400
    );
  }
  assertKnownColumns(table, Object.keys(pk));
  for (const column of pkColumns) {
    if (!(column in pk)) throw new ProjectDbError(`Missing primary key value: ${column}`, 400);
  }
  return pkColumns;
}

export async function insertRow(
  query: QueryFn,
  schema: string,
  table: string,
  values: Record<string, unknown>,
  snapshot?: ProjectDbSchema
): Promise<Record<string, unknown> | null> {
  const definition = requireTable(snapshot ?? (await introspectSchema(query, schema)), table);
  const keys = Object.keys(values ?? {});
  if (keys.length === 0) throw new ProjectDbError("No values provided", 400);
  assertKnownColumns(definition, keys);
  const columns = keys.map(quoteIdent).join(", ");
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(", ");
  const result = await query(
    `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(definition.name)} (${columns})
     VALUES (${placeholders}) RETURNING *`,
    keys.map((key) => values[key])
  );
  return result.rows[0] ?? null;
}

export async function updateRow(
  query: QueryFn,
  schema: string,
  table: string,
  pk: Record<string, unknown>,
  changes: Record<string, unknown>,
  snapshot?: ProjectDbSchema
): Promise<Record<string, unknown>> {
  const definition = requireTable(snapshot ?? (await introspectSchema(query, schema)), table);
  const pkColumns = requirePrimaryKeyValues(definition, pk);
  const changeKeys = Object.keys(changes ?? {});
  if (changeKeys.length === 0) throw new ProjectDbError("No changes provided", 400);
  assertKnownColumns(definition, changeKeys);
  const setClause = changeKeys.map((key, index) => `${quoteIdent(key)} = $${index + 1}`).join(", ");
  const whereClause = pkColumns
    .map((column, index) => `target.${quoteIdent(column)} = $${changeKeys.length + index + 1}`)
    .join(" AND ");
  const result = await query(
    `UPDATE ${quoteIdent(schema)}.${quoteIdent(definition.name)} AS target
     SET ${setClause} WHERE ${whereClause} RETURNING target.*`,
    [...changeKeys.map((key) => changes[key]), ...pkColumns.map((column) => pk[column])]
  );
  if (result.rowCount === 0) throw new ProjectDbError("Row not found", 404);
  return result.rows[0];
}

export async function deleteRow(
  query: QueryFn,
  schema: string,
  table: string,
  pk: Record<string, unknown>,
  snapshot?: ProjectDbSchema
): Promise<void> {
  const definition = requireTable(snapshot ?? (await introspectSchema(query, schema)), table);
  const pkColumns = requirePrimaryKeyValues(definition, pk);
  const whereClause = pkColumns
    .map((column, index) => `target.${quoteIdent(column)} = $${index + 1}`)
    .join(" AND ");
  const result = await query(
    `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(definition.name)} AS target
     WHERE ${whereClause}`,
    pkColumns.map((column) => pk[column])
  );
  if (result.rowCount === 0) throw new ProjectDbError("Row not found", 404);
}

// --- HTTP route registration (kept here to keep app-factory small) ---

interface DbRouteResponse {
  status: (code: number) => DbRouteResponse;
  json: (body: unknown) => void;
}
interface DbRouteRequest {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}
type DbRouteHandler = (request: DbRouteRequest, response: DbRouteResponse) => void | Promise<void>;

export interface ProjectDbRouteDeps {
  get: (path: string, handler: DbRouteHandler) => void;
  post: (path: string, handler: DbRouteHandler) => void;
  /** Resolve the caller from request headers and return the project ids they may access. */
  resolveAccessibleProjectIds: (headers: DbRouteRequest["headers"]) => Promise<string[]>;
  getDatabaseUrl: (projectId: string) => Promise<string | undefined>;
  createQuery?: (connectionString: string) => ProjectQueryFn;
  createTransaction?: (connectionString: string) => PgTransaction;
  runChildMutation?: <T>(
    projectId: string,
    operation: (fence: ProjectMutationFence) => Promise<T>
  ) => Promise<T>;
  /** Record a mutation for compliance (who/what/when). Called only after a write succeeds. */
  audit: (
    headers: DbRouteRequest["headers"],
    projectId: string,
    action: string,
    detail: string
  ) => void;
  ok: (response: DbRouteResponse, body: unknown) => void;
  fail: (response: DbRouteResponse, status: number, code: string, message: string) => void;
}

/** Registers the per-project database browser + editor routes onto the platform HTTP router. */
export function registerProjectDbRoutes(deps: ProjectDbRouteDeps): void {
  const withDb = async (
    request: DbRouteRequest,
    response: DbRouteResponse,
    run: (
      query: QueryFn,
      schema: string,
      projectId: string,
      fence?: ProjectMutationFence
    ) => Promise<unknown>,
    mutation = false
  ) => {
    try {
      const projectId = String(request.params?.projectId ?? "");
      const projectIds = await deps.resolveAccessibleProjectIds(request.headers);
      if (!projectIds.includes(projectId)) throw new ProjectDbError("Unknown project", 404);
      const url = await deps.getDatabaseUrl(projectId);
      if (!url)
        throw new ProjectDbError("Provision the workspace before browsing its database", 409);
      const schema = schemaFromConnectionString(url);
      const operation = async (fence?: ProjectMutationFence) => {
        if (!mutation) {
          return run((deps.createQuery ?? createProjectQuery)(url), schema, projectId, fence);
        }
        await fence?.assertCurrent();
        const transaction = (deps.createTransaction ?? ((connectionString: string) =>
          createPgTransaction({ connectionString })))(url);
        return transaction(async (query) => {
          await query(schemaAdvisoryLockSql(schema));
          await fence?.assertCurrent();
          const result = await run(query, schema, projectId, fence);
          await fence?.assertCurrent();
          return result;
        });
      };
      deps.ok(
        response,
        await (mutation && deps.runChildMutation
          ? deps.runChildMutation(projectId, operation)
          : operation())
      );
    } catch (error) {
      const deletionConflict =
        error instanceof Error && error.name === "ProjectDeletionInProgressError";
      const status = deletionConflict ? 409 : error instanceof ProjectDbError ? error.status : 500;
      deps.fail(
        response,
        status,
        deletionConflict ? "PROJECT_DELETION_IN_PROGRESS" : "DATABASE_BROWSE_ERROR",
        (error as Error).message
      );
    }
  };

  const tableOf = (request: DbRouteRequest) => String(request.params?.table ?? "");
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  deps.get("/projects/:projectId/db/schema", (request, response) =>
    withDb(request, response, (query, schema) => introspectSchema(query, schema))
  );
  deps.get("/projects/:projectId/db/tables/:table", (request, response) =>
    withDb(request, response, (query, schema) =>
      readTablePage(query, schema, tableOf(request), 100, 0)
    )
  );

  // Single write endpoint (the router exposes GET/POST only); the op selects the mutation. Every
  // op goes through the validated, parameterized, primary-key-targeted helpers above.
  deps.post("/projects/:projectId/db/tables/:table/mutate", (request, response) =>
    withDb(
      request,
      response,
      async (query, schema, projectId, fence) => {
        const table = tableOf(request);
        const op = String(request.body?.op ?? "");
        if (op === "insert") {
          await fence?.assertCurrent();
          const row = await insertRow(query, schema, table, asRecord(request.body?.values));
          deps.audit(request.headers, projectId, "database.row.insert", table);
          return { row };
        }
        if (op === "update") {
          await fence?.assertCurrent();
          const row = await updateRow(
            query,
            schema,
            table,
            asRecord(request.body?.pk),
            asRecord(request.body?.changes)
          );
          deps.audit(request.headers, projectId, "database.row.update", table);
          return { row };
        }
        if (op === "delete") {
          await fence?.assertCurrent();
          await deleteRow(query, schema, table, asRecord(request.body?.pk));
          deps.audit(request.headers, projectId, "database.row.delete", table);
          return { deleted: true };
        }
        throw new ProjectDbError(`Unsupported op: ${op || "(none)"}`, 400);
      },
      true
    )
  );
}
