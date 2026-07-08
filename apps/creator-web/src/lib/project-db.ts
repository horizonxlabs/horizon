import { apiBaseUrl } from "./routing";
import { vibeAuthHeaders } from "./session";

// Client for the per-project database browser (backed by the project's scoped Postgres role).
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

async function getJson<T>(path: string): Promise<T> {
  const base = apiBaseUrl() ?? "/api";
  const response = await fetch(`${base}${path}`, { headers: vibeAuthHeaders() });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return body.data as T;
}

export function fetchProjectDbSchema(projectId: string): Promise<ProjectDbSchema> {
  return getJson(`/projects/${encodeURIComponent(projectId)}/db/schema`);
}

export function fetchProjectDbTable(projectId: string, table: string): Promise<ProjectDbTablePage> {
  return getJson(
    `/projects/${encodeURIComponent(projectId)}/db/tables/${encodeURIComponent(table)}`
  );
}
