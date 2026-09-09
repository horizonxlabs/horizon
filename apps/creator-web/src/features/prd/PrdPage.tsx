import { Button, DataTable, Markdown, SectionCard, WorkflowRail } from "@evcp/ui";
import { CheckCircle2, Sparkles } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import { CreatorEmptyState } from "@/shared/CreatorEmptyState";

export function PrdPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    visiblePrdSections,
    visibleVersionRows,
    prdMessage,
    prdStatus,
    prdTechnicalDetails,
    prdErrorSource,
    prdFeedbackTone,
    handleGeneratePrdDraft,
    isGeneratingPrdDraft
  } = app;
  const retryPrd = () =>
    prdErrorSource === "generation"
      ? handleGeneratePrdDraft()
      : app.refreshPrdState(app.selectedProject.id);
  return (
    <CreatorShell
      app={app}
      content={
        <section className="ds-workbench creator-prd-workbench">
          <WorkflowRail
            eyebrow="Docs"
            title="Optional Context"
            steps={[
              { label: "Project context captured", icon: <CheckCircle2 size={16} /> },
              { label: "AI organizes the context", icon: <Sparkles size={16} /> },
              { label: "Docs remain optional", icon: <CheckCircle2 size={16} /> }
            ]}
          />
          <div className="ds-main-stack">
            <SectionCard eyebrow="Docs" title="Project documentation">
              {isGeneratingPrdDraft ? (
                <CreatorState
                  kind="loading"
                  title="Generating docs"
                  description="Horizon is turning your project context into a document. You can keep building while it’s prepared."
                />
              ) : prdStatus === "loading" ? (
                <CreatorState kind="loading" title="Loading docs" />
              ) : prdStatus === "error" ? (
                <CreatorState
                  kind={prdErrorSource === "generation" ? "error" : "unavailable"}
                  title={prdMessage}
                  description={
                    prdErrorSource === "generation"
                      ? "No draft was created."
                      : "Existing docs are unchanged."
                  }
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void retryPrd().catch(() => undefined)}
                    >
                      Retry
                    </Button>
                  }
                  technicalDetails={prdTechnicalDetails}
                />
              ) : prdStatus === "empty" ? (
                <CreatorEmptyState
                  title="No docs yet"
                  description="Keep your app’s goals, requirements, and decisions in one place. Generate a first draft from your project context whenever you’re ready."
                  action={
                    <Button variant="primary" onClick={() => void handleGeneratePrdDraft()}>
                      Generate docs
                    </Button>
                  }
                />
              ) : (
                <>
                  {prdFeedbackTone ? (
                    <CreatorStatusMessage
                      tone={prdFeedbackTone}
                      technicalDetails={prdTechnicalDetails}
                    >
                      {prdMessage}
                    </CreatorStatusMessage>
                  ) : null}
                  <div className="creator-prd-sections">
                    {visiblePrdSections.map((section) => (
                      <article id={section.key} key={section.key}>
                        <span>{section.order}</span>
                        <div>
                          <h3>{section.title}</h3>
                          <div className="creator-prd-markdown">
                            <Markdown text={section.body} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
            {prdStatus === "ready" ? (
              <SectionCard eyebrow="History" title="Document versions">
                <DataTable
                  ariaLabel="Document version history"
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
                  emptyMessage="No earlier documents."
                />
              </SectionCard>
            ) : null}
          </div>
        </section>
      }
    />
  );
}
