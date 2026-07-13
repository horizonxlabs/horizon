import { DataTable, SectionCard } from "@evcp/ui";
import { Gauge, ListFilter, Route } from "lucide-react";

const auditFilterRows = [
  { action: "prd.change.approved", actor: "creator@company.com", severity: "high" },
  { action: "domain.request.approved", actor: "admin@company.com", severity: "high" },
  { action: "ticket.converted_to_prd_change", actor: "creator@company.com", severity: "high" }
];

export function AuditEvidenceSection({ id }: { id?: string }) {
  return (
    <div id={id}>
      <SectionCard eyebrow="Audit Filters" title="Governance evidence search">
        <div className="admin-filter-bar" aria-label="Audit filter controls">
          <button type="button">
            <ListFilter size={15} /> action
          </button>
          <button type="button" className="secondary-button">
            <Gauge size={15} /> severity
          </button>
          <button type="button" className="secondary-button">
            <Route size={15} /> project
          </button>
        </div>
        <DataTable
          columns={[
            { key: "action", label: "Action" },
            { key: "actor", label: "Actor" },
            { key: "severity", label: "Severity", tone: () => "danger" }
          ]}
          rows={auditFilterRows}
        />
      </SectionCard>
    </div>
  );
}
