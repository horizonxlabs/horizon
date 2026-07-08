import {
  DataTable,
  DecisionPanel,
  DefinitionGrid,
  SectionCard,
  ToneBadge,
  WorkflowRail
} from "@evcp/ui";
import { CheckCircle2, FileText, LayoutDashboard, LockKeyhole, Sparkles } from "lucide-react";
import { wizardSteps } from "../../data/mock-data";
import type { useCreatorApp } from "../../hooks/use-creator-app";

export function DefaultProjectsPrdSection({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { selectedProject, visiblePrdSections, visibleVersionRows } = app;
  return (
    <>
      <section className="creator-summary-grid">
        <SectionCard eyebrow="Project Picker · โปรเจกต์ของฉัน" title={selectedProject.name}>
          <div className="creator-project-card">
            <div className="ds-summary-icon">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <strong>{selectedProject.name}</strong>
              <span>
                {selectedProject.appType} · owner {selectedProject.owner}
              </span>
            </div>
            <ToneBadge tone="warning">{selectedProject.status}</ToneBadge>
          </div>
          <DefinitionGrid
            items={[
              { label: "PRD", value: "v1.0 Draft" },
              { label: "Frontend", value: selectedProject.frontendVersion },
              { label: "Access", value: "Owner" },
              { label: "Health", value: <ToneBadge tone="success">healthy</ToneBadge> }
            ]}
          />
          <div className="creator-card-actions">
            <button type="button">Open</button>
            <button type="button" className="ghost-button">
              View PRD
            </button>
            <button type="button" className="ghost-button">
              Archive
            </button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Create Project Wizard" title="Generate PRD">
          <div className="creator-step-list">
            {wizardSteps.map((step) => (
              <div key={step.title}>
                <CheckCircle2 size={16} />
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>
                <ToneBadge tone={step.status === "complete" ? "success" : "info"}>
                  {step.status}
                </ToneBadge>
              </div>
            ))}
          </div>
          <DecisionPanel
            tone="warning"
            badge="Guarded"
            title="PRD generation uses Sprint 2 route, quota and guardrail checks"
            lines={[
              "Required fields complete",
              "Token quota available",
              "Guardrail decision: allow"
            ]}
          />
        </SectionCard>
      </section>

      <section className="ds-workbench creator-prd-workbench">
        <WorkflowRail
          eyebrow="PRD Flow"
          title="Review Path"
          steps={[
            { label: "project input captured", icon: <CheckCircle2 size={16} /> },
            { label: "governed AI route resolved", icon: <CheckCircle2 size={16} /> },
            { label: "PRD draft generated", icon: <CheckCircle2 size={16} /> },
            { label: "Confirm Baseline v1.0", icon: <LockKeyhole size={16} /> }
          ]}
          alert={{
            icon: <FileText size={18} />,
            title: "Baseline immutability",
            description:
              "หลัง confirm แล้ว version 1.0 จะเป็น read-only baseline สำหรับ Sprint 4 workspace",
            tone: "warning"
          }}
        />

        <div className="ds-main-stack">
          <SectionCard
            eyebrow="PRD Viewer"
            title="Structured PRD Sections"
            action={<button type="button">Confirm Baseline</button>}
          >
            <div className="creator-prd-layout">
              <nav className="creator-prd-nav" aria-label="PRD sections">
                {visiblePrdSections.map((section) => (
                  <a href={`#${section.key}`} key={section.key}>
                    {section.title}
                  </a>
                ))}
              </nav>
              <div className="creator-prd-sections">
                {visiblePrdSections.map((section) => (
                  <article id={section.key} key={section.key}>
                    <span>{section.order}</span>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <aside className="creator-prd-meta">
                <ToneBadge tone="warning">draft</ToneBadge>
                <DefinitionGrid
                  items={[
                    { label: "Version", value: "0.1" },
                    { label: "Generated", value: "ล่าสุด" },
                    { label: "Route", value: "prd_generation" },
                    { label: "Model", value: "gpt-4.1" }
                  ]}
                />
              </aside>
            </div>
          </SectionCard>

          <section className="ds-grid-2">
            <SectionCard eyebrow="Version History" title="PRD Version History">
              <DataTable
                columns={[
                  { key: "version", label: "Version" },
                  {
                    key: "status",
                    label: "Status",
                    tone: (value) => (value === "baseline" ? "success" : "warning")
                  },
                  { key: "summary", label: "Summary" },
                  { key: "author", label: "Author" }
                ]}
                rows={visibleVersionRows}
              />
            </SectionCard>

            <SectionCard eyebrow="Confirm Baseline" title="Baseline v1.0">
              <div className="creator-baseline-card">
                <Sparkles size={20} />
                <div>
                  <strong>Ready to lock PRD baseline</strong>
                  <span>
                    การ confirm จะสร้าง immutable version 1.0 และเปิด context ให้ Sprint 4 workspace
                  </span>
                </div>
              </div>
              <DecisionPanel
                tone="success"
                badge="Ready"
                title="Confirm Baseline action is available"
                lines={[
                  "All required PRD sections exist",
                  "Version history will keep draft and baseline",
                  "Audit event: prd.baseline.confirmed"
                ]}
              />
            </SectionCard>
          </section>
        </div>
      </section>
    </>
  );
}
