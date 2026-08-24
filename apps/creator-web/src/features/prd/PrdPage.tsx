import { Button, DataTable, Markdown, SectionCard, WorkflowRail } from "@evcp/ui";
import { CheckCircle2, LockKeyhole } from "lucide-react";
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
    currentPrdVersion,
    handleConfirmPrdBaseline,
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
              action={
                currentPrdVersion && prdStatus === "ready" ? (
                  <Button
                    variant="primary"
                    type="button"
                    disabled={currentPrdVersion.status === "baseline"}
                    onClick={() => {
                      void handleConfirmPrdBaseline();
                    }}
                  >
                    Confirm Baseline
                  </Button>
                ) : null
              }
            >
              {isGeneratingPrdDraft ? (
                <CreatorState
                  kind="loading"
                  title="Generating PRD draft"
                  description="This can take a few minutes."
                />
              ) : prdStatus === "loading" ? (
                <CreatorState kind="loading" title="Loading PRD" />
              ) : prdStatus === "error" ? (
                <CreatorState
                  kind={prdErrorSource === "generation" ? "error" : "unavailable"}
                  title={prdMessage}
                  description={
                    prdErrorSource === "generation"
                      ? "No draft was created."
                      : "Existing PRD versions are unchanged."
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
                  title="No PRD draft yet"
                  description="Generate a draft to review requirements and confirm a baseline."
                  action={
                    <Button variant="primary" onClick={() => void handleGeneratePrdDraft()}>
                      Generate PRD Draft
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
              <SectionCard eyebrow="Version History" title="PRD Version History">
                <DataTable
                  ariaLabel="PRD version history"
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
                  emptyMessage="No earlier PRD versions."
                />
              </SectionCard>
            ) : null}
          </div>
        </section>
      }
    />
  );
}
