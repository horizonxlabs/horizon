import { DataTable, SectionCard, WorkflowRail } from "@evcp/ui";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";

export function PrdPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { visiblePrdSections, visibleVersionRows } = app;
  return (
    <CreatorShell
      app={app}
      content={
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
          />
          <div className="ds-main-stack">
            <SectionCard
              eyebrow="PRD Viewer"
              title="Structured PRD Sections"
              action={<button type="button">Confirm Baseline</button>}
            >
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
            </SectionCard>
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
          </div>
        </section>
      }
    />
  );
}
