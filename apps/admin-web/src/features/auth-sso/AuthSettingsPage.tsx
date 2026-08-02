import { DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { authMappingRows, authProviderRows, authReadinessRows, policyRows } from "./evidence";

const readinessRows = authReadinessRows.map(([integration, status, evidence]) => ({
  integration,
  status,
  evidence
}));

export function AuthSettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Identity & access"
        title="Auth & SSO"
        description="Review identity provider and authorization readiness before enabling enterprise access."
      />
      <DecisionPanel
        tone="info"
        badge="Readiness evidence"
        title="Static configuration evidence"
        lines={["These exported records are readiness evidence, not live identity-provider settings."]}
      />
      <SectionCard eyebrow="Readiness evidence" title="Identity provider readiness">
        <DataTable
          columns={[
            { key: "provider", label: "Provider" },
            { key: "type", label: "Protocol" },
            { key: "status", label: "Status", tone: () => "info" },
            { key: "mapping", label: "Role mapping" }
          ]}
          rows={authProviderRows}
        />
      </SectionCard>
      <SectionCard eyebrow="Readiness evidence" title="Integration checks">
        <DataTable
          columns={[
            { key: "integration", label: "Integration" },
            { key: "status", label: "Status", tone: () => "info" },
            { key: "evidence", label: "Evidence" }
          ]}
          rows={readinessRows}
        />
      </SectionCard>
      <SectionCard eyebrow="Readiness evidence" title="Role and access policy evidence">
        <DataTable
          columns={[
            { key: "source", label: "Source group" },
            { key: "platform", label: "Platform role" },
            { key: "project", label: "Project role" },
            { key: "app", label: "App role" }
          ]}
          rows={authMappingRows}
        />
        <DataTable
          columns={[
            { key: "classification", label: "Classification" },
            { key: "reviewers", label: "Reviewers" },
            { key: "checks", label: "Checks" },
            { key: "exposure", label: "Exposure" }
          ]}
          rows={policyRows}
        />
      </SectionCard>
    </section>
  );
}
