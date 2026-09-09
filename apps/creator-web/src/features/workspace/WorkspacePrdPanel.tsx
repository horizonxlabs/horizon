import { Button, DataTable, Markdown, SectionCard } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import { CreatorEmptyState } from "@/shared/CreatorEmptyState";

// PRD as a workspace tab: the spec shadows the build instead of gating it.
// Reuses the PRD state already carried by the app hook; the standalone /prd route keeps
// working for deep links, but the sidebar entry is gone.
export function WorkspacePrdPanel({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    visiblePrdSections,
    visibleVersionRows,
    prdMessage,
    prdStatus,
    prdTechnicalDetails,
    prdErrorSource,
    prdFeedbackTone,
    currentPrdVersion,
    handleGeneratePrdDraft,
    isGeneratingPrdDraft
  } = app;
  const retryPrd = () =>
    prdErrorSource === "generation"
      ? handleGeneratePrdDraft()
      : app.refreshPrdState(app.selectedProject.id);
  const effectivePrdStatus =
    prdStatus ?? (currentPrdVersion || visiblePrdSections.length ? "ready" : "empty");
  return (
    <div className="vibe-prd-panel">
      <SectionCard eyebrow="Docs" title="Project documentation">
        {isGeneratingPrdDraft ? (
          <CreatorState
            kind="loading"
            title="Generating docs"
            description="Horizon is turning your project context into a document. You can keep building while it’s prepared."
          />
        ) : effectivePrdStatus === "loading" ? (
          <CreatorState kind="loading" title="Loading docs" />
        ) : effectivePrdStatus === "error" ? (
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
                type="button"
                onClick={() => void retryPrd().catch(() => undefined)}
              >
                Retry
              </Button>
            }
            technicalDetails={prdTechnicalDetails}
          />
        ) : effectivePrdStatus === "empty" ? (
          <CreatorEmptyState
            title="No docs yet"
            description="Keep your app’s goals, requirements, and decisions in one place. Generate a first draft from your project context whenever you’re ready."
            action={
              <Button variant="primary" type="button" onClick={() => void handleGeneratePrdDraft()}>
                Generate docs
              </Button>
            }
          />
        ) : (
          <>
            {prdFeedbackTone ? (
              <CreatorStatusMessage tone={prdFeedbackTone} technicalDetails={prdTechnicalDetails}>
                {prdMessage}
              </CreatorStatusMessage>
            ) : null}
            <div className="creator-prd-sections">
              {visiblePrdSections.map((section) => (
                <article id={`ws-${section.key}`} key={section.key}>
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
      {effectivePrdStatus === "ready" ? (
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
  );
}
