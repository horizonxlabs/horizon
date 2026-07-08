import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataGrid,
  SelectColumn,
  renderTextEditor,
  type Column,
  type RowsChangeData
} from "react-data-grid";
import {
  fetchProjectDbSchema,
  fetchProjectDbTable,
  mutateProjectDbRow,
  type ProjectDbColumn,
  type ProjectDbSchema
} from "../lib/project-db";

type Row = Record<string, unknown>;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function WorkspaceDatabasePanel({ projectId }: { projectId: string }) {
  const [schema, setSchema] = useState<ProjectDbSchema | undefined>(undefined);
  const [schemaError, setSchemaError] = useState<string | undefined>(undefined);
  const [activeTable, setActiveTable] = useState<string | undefined>(undefined);
  const [columns, setColumns] = useState<ProjectDbColumn[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [dataError, setDataError] = useState<string | undefined>(undefined);
  const [writeError, setWriteError] = useState<string | undefined>(undefined);
  const [loadingRows, setLoadingRows] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const pkColumns = useMemo(
    () => columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
    [columns]
  );
  const editable = pkColumns.length > 0;

  const rowKeyGetter = useCallback(
    (row: Row) =>
      pkColumns.length ? pkColumns.map((c) => String(row[c])).join("|") : JSON.stringify(row),
    [pkColumns]
  );

  const loadTable = useCallback(
    async (table: string) => {
      setLoadingRows(true);
      setDataError(undefined);
      setWriteError(undefined);
      setSelected(new Set());
      try {
        const page = await fetchProjectDbTable(projectId, table);
        setColumns(page.columns);
        setRows(page.rows);
        setTotal(page.total);
      } catch (error) {
        setDataError((error as Error).message);
      } finally {
        setLoadingRows(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    let cancelled = false;
    setSchema(undefined);
    setSchemaError(undefined);
    setActiveTable(undefined);
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
    if (activeTable) void loadTable(activeTable);
  }, [activeTable, loadTable]);

  const gridColumns = useMemo<Column<Row>[]>(() => {
    const dataColumns: Column<Row>[] = columns.map((column) => ({
      key: column.name,
      name: column.name,
      resizable: true,
      editable: editable && !column.isPrimaryKey,
      renderEditCell: editable && !column.isPrimaryKey ? renderTextEditor : undefined,
      renderCell: ({ row }) => formatCell(row[column.name])
    }));
    return editable ? [SelectColumn, ...dataColumns] : dataColumns;
  }, [columns, editable]);

  function handleRowsChange(nextRows: Row[], data: RowsChangeData<Row>) {
    if (!activeTable) return;
    setRows(nextRows);
    const changed = nextRows[data.indexes[0]];
    const columnKey = data.column.key;
    const pk = Object.fromEntries(pkColumns.map((c) => [c, changed[c]]));
    mutateProjectDbRow(projectId, activeTable, {
      op: "update",
      pk,
      changes: { [columnKey]: changed[columnKey] }
    }).catch((error: Error) => setWriteError(error.message));
  }

  async function deleteSelected() {
    if (!activeTable || selected.size === 0) return;
    setWriteError(undefined);
    try {
      for (const key of selected) {
        const row = rows.find((candidate) => rowKeyGetter(candidate) === key);
        if (!row) continue;
        const pk = Object.fromEntries(pkColumns.map((c) => [c, row[c]]));
        await mutateProjectDbRow(projectId, activeTable, { op: "delete", pk });
      }
      await loadTable(activeTable);
    } catch (error) {
      setWriteError((error as Error).message);
    }
  }

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
        <div className="hz-db-data-head">
          <strong>{activeTable}</strong>
          <span>{total} rows</span>
          {!editable ? <span className="hz-db-flag">read-only (ไม่มี primary key)</span> : null}
          <div className="hz-db-actions">
            {editable ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => void deleteSelected()}
                disabled={selected.size === 0}
              >
                <Trash2 size={14} /> ลบ ({selected.size})
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button"
              onClick={() => activeTable && void loadTable(activeTable)}
            >
              <RotateCcw size={14} /> รีเฟรช
            </button>
          </div>
        </div>
        {writeError ? <div className="hz-db-error">เขียนไม่สำเร็จ: {writeError}</div> : null}
        {dataError ? (
          <div className="hz-db-empty">โหลดข้อมูลไม่สำเร็จ: {dataError}</div>
        ) : loadingRows ? (
          <div className="hz-db-empty">กำลังโหลด {activeTable}…</div>
        ) : rows.length === 0 ? (
          <div className="hz-db-empty">ไม่มีข้อมูลในตารางนี้</div>
        ) : (
          <DataGrid
            className="hz-db-rdg rdg-light"
            columns={gridColumns}
            rows={rows}
            rowKeyGetter={rowKeyGetter}
            onRowsChange={handleRowsChange}
            selectedRows={selected}
            onSelectedRowsChange={setSelected}
          />
        )}
      </div>
    </div>
  );
}

export default WorkspaceDatabasePanel;
