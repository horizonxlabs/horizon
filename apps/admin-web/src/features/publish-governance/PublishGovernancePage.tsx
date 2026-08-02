import { DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { ticketCountRows } from "./evidence";

export function PublishGovernancePage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Publishing governance"
        title="Publishing"
        description="Review published-app feedback and change-governance readiness evidence."
      />
      <DecisionPanel
        tone="info"
        badge="Readiness evidence"
        title="Static publishing governance evidence"
        lines={["These exported records are readiness evidence, not live publishing or ticket settings."]}
      />
      <SectionCard eyebrow="Readiness evidence" title="Publishing change signals">
        <DataTable
          columns={[
            { key: "metric", label: "Metric" },
            { key: "value", label: "Count" },
            { key: "trend", label: "Evidence" }
          ]}
          rows={ticketCountRows}
        />
      </SectionCard>
    </section>
  );
}
