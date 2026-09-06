import { Button, DataTable, Markdown, SectionCard } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";

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
      <SectionCard eyebrow="AI Notes" title="Project Context">
        {isGeneratingPrdDraft ? (
          <CreatorState
            kind="loading"
            title="Generating AI project note"
            description="AI is organizing the project context. This note is optional and never blocks publishing."
          />
        ) : effectivePrdStatus === "loading" ? (
          <CreatorState kind="loading" title="Loading project notes" />
        ) : effectivePrdStatus === "error" ? (
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
                type="button"
                onClick={() => void retryPrd().catch(() => undefined)}
              >
                Retry
              </Button>
            }
            technicalDetails={prdTechnicalDetails}
          />
        ) : effectivePrdStatus === "empty" ? (
          <CreatorState
            kind="empty"
            title="No AI project note yet"
            description="This optional note helps AI remember project context. You can build and publish without it."
            action={
              <Button variant="primary" type="button" onClick={() => void handleGeneratePrdDraft()}>
                Generate AI Note
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
  );
}
