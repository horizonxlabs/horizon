import { DataTable, DecisionPanel, SectionCard, ToneBadge } from "@evcp/ui";
import {
  Database,
  GitCompareArrows,
  History,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Table2
} from "lucide-react";
import { checkpointRows, databaseTables, migrationRows, sampleRecords } from "@/shared/mock-data";

export function DefaultDatabaseVersionsSection() {
  return (
    <section className="sprint5-shell" aria-label="Database and frontend versions">
      <div className="sprint5-main-panel">
        <SectionCard
          eyebrow="Database View"
          title="Read-only App Data Model"
          action={<ToneBadge tone="info">No raw SQL</ToneBadge>}
        >
          <div className="database-overview">
            <div className="database-rail">
              <div className="database-rail-header">
                <Database size={18} />
                <strong>Schema</strong>
              </div>
              {databaseTables.map((table) => (
                <button
                  type="button"
                  className={table.table === "leave_requests" ? "" : "ghost-button"}
                  key={table.table}
                >
                  <Table2 size={15} />
                  {table.table}
                </button>
              ))}
            </div>
            <div className="database-detail">
              <div className="database-detail-header">
                <div>
                  <span className="eyebrow">Selected Table</span>
                  <h3>leave_requests</h3>
                  <p>Business-friendly metadata for request type, status and employee ownership.</p>
                </div>
                <ToneBadge tone="success">read-only</ToneBadge>
              </div>
              <DataTable
                columns={[
                  { key: "table", label: "Table" },
                  { key: "type", label: "Type" },
                  { key: "columns", label: "Columns" },
                  { key: "records", label: "Sample Records" }
                ]}
                rows={databaseTables}
              />
            </div>
          </div>
        </SectionCard>

        <section className="sprint5-subgrid">
          <SectionCard eyebrow="Sample Records" title="leave_requests Preview">
            <DataTable
              columns={[
                { key: "id", label: "ID" },
                { key: "leaveType", label: "Leave Type" },
                {
                  key: "status",
                  label: "Status",
                  tone: (value) => (value === "approved" ? "success" : "warning")
                },
                { key: "owner", label: "Owner" }
              ]}
              rows={sampleRecords}
            />
          </SectionCard>

          <SectionCard eyebrow="Migration History" title="Applied App Migrations">
            <DataTable
              columns={[
                { key: "migration", label: "Migration" },
                { key: "status", label: "Status", tone: () => "success" },
                { key: "prd", label: "PRD" },
                { key: "checkpoint", label: "Frontend" }
              ]}
              rows={migrationRows}
            />
          </SectionCard>
        </section>
      </div>

      <aside className="sprint5-side-panel">
        <SectionCard eyebrow="Frontend Versions" title="Checkpoint Timeline">
          <div className="checkpoint-timeline">
            {checkpointRows.map((checkpoint) => (
              <div key={checkpoint.version}>
                <History size={16} />
                <div>
                  <strong>{checkpoint.version}</strong>
                  <span>{checkpoint.summary}</span>
                </div>
                <ToneBadge tone={checkpoint.status === "current" ? "success" : "neutral"}>
                  {checkpoint.status}
                </ToneBadge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Compare"
          title="fe-0001 -> fe-0002"
          action={
            <button type="button" className="ghost-button">
              <GitCompareArrows size={15} /> Compare
            </button>
          }
        >
          <div className="compare-summary">
            <p>
              <strong>Changed:</strong> UI components, frontend routing, CSS styles.
            </p>
            <p>
              <strong>Preview:</strong> old version remains available before restore.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Restore Boundary"
          title="Restore Frontend Only"
          action={
            <button type="button">
              <RotateCcw size={15} /> Restore
            </button>
          }
        >
          <div className="restore-boundary">
            <div>
              <ShieldCheck size={18} />
              <strong>Will change</strong>
              <span>React pages, UI components, CSS styles and frontend routing.</span>
            </div>
            <div>
              <LockKeyhole size={18} />
              <strong>Will not change</strong>
              <span>
                backend, database, auth, app roles, membership, domain settings and PRD baseline.
              </span>
            </div>
          </div>
          <DecisionPanel
            tone="success"
            badge="Audited"
            title="Restore creates a new current checkpoint"
            lines={[
              "Audit event: frontend.restore.completed",
              "Backend and data boundaries remain unchanged"
            ]}
          />
        </SectionCard>
      </aside>
    </section>
  );
}
