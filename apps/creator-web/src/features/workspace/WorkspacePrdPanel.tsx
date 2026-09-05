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
    handleConfirmPrdBaseline,
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
      <SectionCard
        eyebrow="PRD"
        title="Product Spec"
        action={
          currentPrdVersion && effectivePrdStatus === "ready" ? (
            <Button
              variant="primary"
              type="button"
              disabled={currentPrdVersion.status === "baseline"}
              onClick={() => {
                void handleConfirmPrdBaseline();
              }}
            >
              {currentPrdVersion.status === "baseline" ? "Baseline confirmed" : "Confirm Baseline"}
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
        ) : effectivePrdStatus === "loading" ? (
          <CreatorState kind="loading" title="Loading PRD" />
        ) : effectivePrdStatus === "error" ? (
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
            title="No PRD draft yet"
            description="Generate a draft to review requirements and confirm a baseline."
            action={
              <Button variant="primary" type="button" onClick={() => void handleGeneratePrdDraft()}>
                Generate PRD Draft
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
        <SectionCard eyebrow="History" title="PRD Versions">
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
  );
}
