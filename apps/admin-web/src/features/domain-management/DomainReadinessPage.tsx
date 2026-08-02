import { DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { domainRequestRows } from "@/features/publish-governance";

export function DomainReadinessPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Publishing governance"
        title="Domains"
        description="Review domain-routing approval evidence before an application is exposed."
      />
      <DecisionPanel
        tone="info"
        badge="Readiness evidence"
        title="Static domain approval evidence"
        lines={["These exported records are readiness evidence, not live domain or DNS settings."]}
      />
      <SectionCard eyebrow="Readiness evidence" title="Domain request approvals">
        <DataTable
          columns={[
            { key: "request", label: "Request" },
            { key: "domain", label: "Domain" },
            { key: "project", label: "Project" },
            { key: "status", label: "Status", tone: () => "success" },
            { key: "policy", label: "Access policy" }
          ]}
          rows={domainRequestRows}
        />
      </SectionCard>
    </section>
  );
}
