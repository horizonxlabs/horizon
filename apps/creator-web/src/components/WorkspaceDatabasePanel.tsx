import { useEffect, useState } from "react";
import {
  fetchProjectDbSchema,
  fetchProjectDbTable,
  type ProjectDbSchema,
  type ProjectDbTablePage
} from "../lib/project-db";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function WorkspaceDatabasePanel({ projectId }: { projectId: string }) {
  const [schema, setSchema] = useState<ProjectDbSchema | undefined>(undefined);
  const [schemaError, setSchemaError] = useState<string | undefined>(undefined);
  const [activeTable, setActiveTable] = useState<string | undefined>(undefined);
  const [page, setPage] = useState<ProjectDbTablePage | undefined>(undefined);
  const [pageError, setPageError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    setSchemaError(undefined);
    setActiveTable(undefined);
    setPage(undefined);
    fetchProjectDbSchema(projectId)
      .then((snapshot) => {
        if (cancelled) return;
        setSchema(snapshot);
        setActiveTable(snapshot.tables[0]?.name);
      })
      .catch((error: Error) => {
        if (!cancelled) setSchemaError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!activeTable) return;
    let cancelled = false;
    setPage(undefined);
    setPageError(undefined);
    fetchProjectDbTable(projectId, activeTable)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((error: Error) => {
        if (!cancelled) setPageError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, activeTable]);

  if (schemaError) return <div className="hz-db-empty">โหลด schema ไม่สำเร็จ: {schemaError}</div>;
  if (!schema) return <div className="hz-db-empty">กำลังโหลด schema…</div>;
  if (schema.tables.length === 0) {
    return <div className="hz-db-empty">ยังไม่มีตารางใน schema “{schema.schema}”</div>;
  }

  return (
    <div className="hz-db">
      <aside className="hz-db-tables" aria-label="Tables">
        <div className="hz-db-schema">{schema.schema}</div>
        {schema.tables.map((table) => (
          <button
            type="button"
            key={table.name}
            className={`hz-db-table-item ${table.name === activeTable ? "is-active" : ""}`.trim()}
            onClick={() => setActiveTable(table.name)}
          >
            <strong>{table.name}</strong>
            <span>{table.columns.length} cols</span>
          </button>
        ))}
      </aside>
      <div className="hz-db-data">
        {pageError ? (
          <div className="hz-db-empty">โหลดข้อมูลไม่สำเร็จ: {pageError}</div>
        ) : !page ? (
          <div className="hz-db-empty">กำลังโหลด {activeTable}…</div>
        ) : (
          <>
            <div className="hz-db-data-head">
              <strong>{page.table}</strong>
              <span>{page.total} rows</span>
            </div>
            <div className="hz-db-scroll">
              <table className="hz-db-grid">
                <thead>
                  <tr>
                    {page.columns.map((column) => (
                      <th key={column.name}>
                        {column.name}
                        <em>
                          {column.dataType}
                          {column.isPrimaryKey ? " · pk" : ""}
                        </em>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.length === 0 ? (
                    <tr>
                      <td className="hz-db-norows" colSpan={Math.max(1, page.columns.length)}>
                        ไม่มีข้อมูลในตารางนี้
                      </td>
                    </tr>
                  ) : (
                    page.rows.map((row, index) => (
                      <tr key={index}>
                        {page.columns.map((column) => (
                          <td key={column.name}>{formatCell(row[column.name])}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
