import { getDatabaseView, type DatabaseViewSnapshotDto } from "@evcp/api-client";
import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "../lib/creator-client";

function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function WorkspaceDatabasePanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<DatabaseViewSnapshotDto | undefined>(undefined);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [activeTableKey, setActiveTableKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    setErrorText(undefined);
    getDatabaseView(createCreatorPlatformClient(), projectId)
      .then((snapshot) => {
        if (cancelled) return;
        setView(snapshot);
        setActiveTableKey(snapshot.tables[0]?.key);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error as { status?: number; message?: string };
        // eslint-disable-next-line no-console
        console.error("[database] load failed", projectId, detail?.status, detail?.message);
        setErrorText(`${detail?.status ?? "?"} · ${detail?.message ?? "network error"}`);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (errorText) {
    return (
      <div className="hz-db-empty">
        โหลด schema ไม่สำเร็จ ({errorText}) — project: {projectId}
      </div>
    );
  }
  if (!view) return <div className="hz-db-empty">กำลังโหลด schema…</div>;
  if (view.tables.length === 0) {
    return <div className="hz-db-empty">ยังไม่มีตาราง — สร้างผ่าน AI migration ใน chat</div>;
  }

  const table = view.tables.find((item) => item.key === activeTableKey) ?? view.tables[0];
  const rows = view.sampleRecords
    .filter((record) => record.tableKey === table.key)
    .sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div className="hz-db">
      <aside className="hz-db-tables" aria-label="Tables">
        <div className="hz-db-schema">{view.schemaName}</div>
        {view.tables.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`hz-db-table-item ${item.key === table.key ? "is-active" : ""}`.trim()}
            onClick={() => setActiveTableKey(item.key)}
          >
            <strong>{item.displayName}</strong>
            <span>{item.columns.length} cols</span>
          </button>
        ))}
      </aside>
      <div className="hz-db-data">
        <div className="hz-db-data-head">
          <strong>{table.displayName}</strong>
          <span>{rows.length} rows</span>
        </div>
        <div className="hz-db-scroll">
          <table className="hz-db-grid">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column.name}>
                    {column.name}
                    <em>{column.dataType}</em>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="hz-db-norows" colSpan={Math.max(1, table.columns.length)}>
                    ยังไม่มีข้อมูลในตารางนี้
                  </td>
                </tr>
              ) : (
                rows.map((record) => (
                  <tr key={record.id}>
                    {table.columns.map((column) => (
                      <td key={column.name}>{formatCell(record.data[column.name])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
