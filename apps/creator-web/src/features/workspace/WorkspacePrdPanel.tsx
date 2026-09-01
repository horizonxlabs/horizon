import { Button, DataTable, DecisionPanel, Markdown, SectionCard } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";

// PRD as a workspace tab: the spec shadows the build instead of gating it.
// Reuses the PRD state already carried by the app hook; the standalone /prd route keeps
// working for deep links, but the sidebar entry is gone.
export function WorkspacePrdPanel({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    visiblePrdSections,
    visibleVersionRows,
    prdMessage,
    currentPrdVersion,
    handleConfirmPrdBaseline,
    handleGeneratePrdDraft,
    isGeneratingPrdDraft
  } = app;
  return (
    <div className="vibe-prd-panel">
      <SectionCard
        eyebrow="PRD"
        title="Product Spec"
        action={
          currentPrdVersion ? (
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
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled={isGeneratingPrdDraft}
              onClick={() => {
                void handleGeneratePrdDraft();
              }}
            >
              {isGeneratingPrdDraft ? "Generating PRD" : "Generate PRD Draft"}
            </Button>
          )
        }
      >
        <p>{prdMessage}</p>
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
        {!visiblePrdSections.length && !isGeneratingPrdDraft && (
          <DecisionPanel
            tone="info"
            badge="PRD"
            title="No PRD is available for this project"
            lines={["A PRD is drafted after project creation, or you can generate one here at any time."]}
          />
        )}
      </SectionCard>
      <SectionCard eyebrow="History" title="PRD Versions">
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
  );
}
