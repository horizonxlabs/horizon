import { Button, DataTable, Markdown, SectionCard, WorkflowRail } from "@evcp/ui";
import { CheckCircle2, Sparkles } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";

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
            eyebrow="AI Notes"
            title="Optional Context"
            steps={[
              { label: "Project context captured", icon: <CheckCircle2 size={16} /> },
              { label: "AI organizes the context", icon: <Sparkles size={16} /> },
              { label: "Notes remain optional", icon: <CheckCircle2 size={16} /> }
            ]}
          />
          <div className="ds-main-stack">
            <SectionCard eyebrow="AI Project Notes" title="Project Context">
              {isGeneratingPrdDraft ? (
                <CreatorState
                  kind="loading"
                  title="Generating AI project note"
                  description="AI is organizing the project context. This note is optional and never blocks publishing."
                />
              ) : prdStatus === "loading" ? (
                <CreatorState kind="loading" title="Loading project notes" />
              ) : prdStatus === "error" ? (
                <CreatorState
                  kind={prdErrorSource === "generation" ? "error" : "unavailable"}
                  title={prdMessage}
                  description={
                    prdErrorSource === "generation"
                      ? "No draft was created."
                      : "Existing project notes are unchanged."
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
                <CreatorState
                  kind="empty"
                  title="No AI project note yet"
                  description="This optional note helps AI remember project context. You can build and publish without it."
                  action={
                    <Button variant="primary" onClick={() => void handleGeneratePrdDraft()}>
                      Generate AI Note
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
              <SectionCard eyebrow="History" title="Project Note Versions">
                <DataTable
                  ariaLabel="Project note version history"
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
                  emptyMessage="No earlier project notes."
                />
              </SectionCard>
            ) : null}
          </div>
        </section>
      }
    />
  );
}
