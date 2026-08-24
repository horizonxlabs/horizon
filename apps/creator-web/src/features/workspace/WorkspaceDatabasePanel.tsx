import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@evcp/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataGrid,
  SelectColumn,
  renderTextEditor,
  type Column,
  type RowsChangeData
} from "react-data-grid";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import { formatDatabaseValue } from "./format-database-value";
import {
  fetchProjectDbSchema,
  fetchProjectDbTable,
  mutateProjectDbRow,
  type ProjectDbColumn,
  type ProjectDbSchema
} from "./project-db";

type Row = Record<string, unknown>;

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
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [schemaRetryKey, setSchemaRetryKey] = useState(0);

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
      setAdding(false);
      setNewRow({});
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
  }, [projectId, schemaRetryKey]);

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
      renderCell: ({ row }) => formatDatabaseValue(row[column.name])
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

  async function handleAddRow() {
    if (!activeTable) return;
    setWriteError(undefined);
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(newRow)) {
      if (value !== "") values[key] = value;
    }
    if (Object.keys(values).length === 0) {
      setWriteError("Fill in at least one field.");
      return;
    }
    try {
      await mutateProjectDbRow(projectId, activeTable, { op: "insert", values });
      setAdding(false);
      setNewRow({});
      await loadTable(activeTable);
    } catch (error) {
      setWriteError((error as Error).message);
    }
  }

  if (schemaError) {
    return (
      <CreatorState
        kind="unavailable"
        title="Database could not be loaded"
        description="The database schema is temporarily unavailable. Your project data is unchanged."
        action={
          <Button variant="secondary" type="button" onClick={() => setSchemaRetryKey((key) => key + 1)}>
            Retry
          </Button>
        }
        technicalDetails={schemaError}
      />
    );
  }
  if (!schema) {
    return (
      <CreatorState
        kind="loading"
        title="Loading database schema"
        description="Preparing the tables available to this project."
      />
    );
  }
  if (schema.tables.length === 0) {
    return (
      <CreatorState
        kind="empty"
        title="No tables yet"
        description="Create a database table in Workspace to start storing project records."
      />
    );
  }

  return (
    <div className="hz-db">
      <aside className="hz-db-tables" aria-label="Database tables" role="region" tabIndex={0}>
        <div className="hz-db-schema">{schema.schema}</div>
        {schema.tables.map((table) => (
          <button
            type="button"
            key={table.name}
            className={`hz-db-table-item ${table.name === activeTable ? "is-active" : ""}`.trim()}
            aria-pressed={table.name === activeTable}
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
          {!editable ? <span className="hz-db-flag">read-only (no primary key)</span> : null}
          <div className="hz-db-actions">
            {editable ? (
              <Button variant="ghost" type="button" onClick={() => setAdding((value) => !value)}>
                <Plus size={14} /> New row
              </Button>
            ) : null}
            {editable ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => void deleteSelected()}
                disabled={selected.size === 0}
              >
                <Trash2 size={14} /> Delete ({selected.size})
              </Button>
            ) : null}
            <Button
              variant="ghost"
              type="button"
              onClick={() => activeTable && void loadTable(activeTable)}
            >
              <RotateCcw size={14} /> Refresh
            </Button>
          </div>
        </div>
        {adding ? (
          <div className="hz-db-addrow">
            {columns.map((column) => (
              <label key={column.name}>
                <span>
                  {column.name}
                  {column.isPrimaryKey ? " · pk" : ""}
                </span>
                <input
                  value={newRow[column.name] ?? ""}
                  onChange={(event) =>
                    setNewRow((current) => ({ ...current, [column.name]: event.target.value }))
                  }
                  placeholder={column.dataType}
                />
              </label>
            ))}
            <div className="hz-db-addrow-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewRow({});
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" type="button" onClick={() => void handleAddRow()}>
                Add row
              </Button>
            </div>
          </div>
        ) : null}
        {writeError ? (
          <CreatorStatusMessage tone="danger" technicalDetails={writeError}>
            <strong>Write failed.</strong> Your existing records remain available.
          </CreatorStatusMessage>
        ) : null}
        {dataError ? (
          <CreatorState
            kind="unavailable"
            title="Database could not be loaded"
            description="Records for this table are temporarily unavailable."
            action={
              <Button
                variant="secondary"
                type="button"
                onClick={() => activeTable && void loadTable(activeTable)}
              >
                Retry
              </Button>
            }
            technicalDetails={dataError}
          />
        ) : loadingRows ? (
          <CreatorState
            kind="loading"
            title="Loading records"
            description={`Retrieving records from ${activeTable}.`}
          />
        ) : rows.length === 0 ? (
          <CreatorState
            kind="empty"
            title="No records yet"
            description="Add the first record when this table is ready for project data."
          />
        ) : (
          <div
            className="hz-db-scroll"
            role="region"
            aria-label={`Records in ${activeTable}`}
            tabIndex={0}
          >
            <DataGrid
              className="hz-db-rdg rdg-light"
              columns={gridColumns}
              rows={rows}
              rowKeyGetter={rowKeyGetter}
              onRowsChange={handleRowsChange}
              selectedRows={selected}
              onSelectedRowsChange={setSelected}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceDatabasePanel;
