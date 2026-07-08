import { DataTable, DecisionPanel, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, Monitor, RefreshCw, Send, Tablet } from "lucide-react";
import type { useCreatorApp } from "../../hooks/use-creator-app";

export function DefaultWorkspaceSection({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    workspaceSnapshot,
    visiblePreview,
    visibleTokenBudget,
    latestTask,
    promptDraft,
    setPromptDraft,
    workspaceResult,
    handleSubmitPrompt,
    isSubmittingPrompt,
    workspaceMessage,
    visibleTaskSteps,
    handleRefreshPreview,
    isRefreshingPreview,
    visibleHighlights,
    visibleUsage
  } = app;
  return (
    <>
      <section className="workspace-topbar">
        {[
          ["Project", selectedProject.name],
          [
            "PRD",
            workspaceSnapshot?.baseline.version
              ? `Baseline v${workspaceSnapshot.baseline.version}`
              : "Baseline v1.0"
          ],
          ["Frontend", visiblePreview.version],
          [
            "Token Remaining",
            `${visibleTokenBudget.remainingToday} today / ${visibleTokenBudget.remainingMonth} month`
          ],
          ["Publish", latestTask?.status === "blocked" ? "blocked" : "not ready"]
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="workspace-shell">
        <div className="workspace-left-panel">
          <SectionCard eyebrow="Prompt Composer" title="Chat + AI Plan">
            <div className="prompt-thread">
              <div className="prompt-message user">
                <strong>Creator</strong>
                <p>{latestTask?.prompt ?? promptDraft}</p>
              </div>
              <div className="prompt-message system">
                <strong>Guardrail pre-check</strong>
                <p>
                  Decision:{" "}
                  {latestTask?.guardrailDecision ?? workspaceResult?.guardrail.decision ?? "allow"}{" "}
                  · event{" "}
                  {latestTask?.guardrailEventId ??
                    workspaceResult?.guardrail.eventId ??
                    "local_guardrail_0001"}
                </p>
              </div>
              <div className="prompt-message ai">
                <strong>AI Task</strong>
                <p>{visiblePreview.summary}</p>
              </div>
            </div>
            <div className="prompt-composer">
              <label>
                Prompt จะถูกตรวจตาม Guardrail ก่อนส่ง AI
                <input
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={handleSubmitPrompt}
                disabled={isSubmittingPrompt || !promptDraft.trim()}
              >
                <Send size={16} />
                {isSubmittingPrompt ? "Sending" : "Send"}
              </button>
            </div>
            <div className="workspace-action-evidence" aria-label="Workspace action evidence">
              <strong>
                {latestTask?.status === "blocked" ? "Prompt blocked" : "Workspace API evidence"}
              </strong>
              <span>{workspaceMessage}</span>
              <ToneBadge
                tone={
                  latestTask?.status === "blocked"
                    ? "warning"
                    : workspaceSnapshot || workspaceResult
                      ? "success"
                      : "neutral"
                }
              >
                {latestTask?.status ?? "ready"}
              </ToneBadge>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Task Progress" title="Deterministic AI Steps">
            <div className="workspace-progress-list">
              {visibleTaskSteps.map((step) => (
                <div key={step.label}>
                  <CheckCircle2 size={15} />
                  <span>{step.order}</span>
                  <strong>{step.label}</strong>
                  <ToneBadge
                    tone={
                      step.status === "failed"
                        ? "danger"
                        : step.status === "pending"
                          ? "neutral"
                          : step.status === "warning"
                            ? "warning"
                            : "success"
                    }
                  >
                    {step.status}
                  </ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          eyebrow="Live Preview"
          title={`${visiblePreview.screenTitle} Preview`}
          action={
            <button
              type="button"
              className="ghost-button"
              onClick={handleRefreshPreview}
              disabled={isRefreshingPreview}
            >
              <RefreshCw size={15} /> {isRefreshingPreview ? "Refreshing" : "Refresh"}
            </button>
          }
        >
          <div className="preview-toolbar">
            <button type="button">
              <Monitor size={15} /> Desktop
            </button>
            <button type="button" className="ghost-button">
              <Tablet size={15} /> Tablet
            </button>
            <button type="button" className="ghost-button">
              Mobile
            </button>
            <ToneBadge tone="info">{visiblePreview.version}</ToneBadge>
          </div>
          <div className="live-preview-frame">
            <header>
              <div>
                <span>{visiblePreview.screenTitle}</span>
                <strong>{visiblePreview.summary}</strong>
              </div>
              <ToneBadge tone="success">Healthy</ToneBadge>
            </header>
            <section className="preview-status-strip" aria-label="Preview status">
              <div>
                <span>Requests</span>
                <strong>24</strong>
                <small>+ WFH option</small>
              </div>
              <div>
                <span>Approval SLA</span>
                <strong>1.8d</strong>
                <small>manager queue</small>
              </div>
              <div>
                <span>Policy</span>
                <strong>Ready</strong>
                <small>shown before submit</small>
              </div>
            </section>
            <section className="preview-board">
              {visibleHighlights.map((highlight, index) => (
                <article key={highlight}>
                  <span>
                    {index === 0 ? "New Type" : index === 1 ? "Approval Queue" : "Governance"}
                  </span>
                  <strong>{highlight}</strong>
                  <p>
                    {index === 0
                      ? "Employee can select the updated flow in the same request path."
                      : index === 1
                        ? "Manager review evidence remains visible in the preview."
                        : "Policy and audit context stay attached to the generated change."}
                  </p>
                </article>
              ))}
            </section>
          </div>
        </SectionCard>

        <aside className="workspace-context-panel">
          <SectionCard eyebrow="Token Remaining" title="Quota">
            <DefinitionGrid
              items={[
                { label: "Today", value: `${visibleTokenBudget.remainingToday} tokens` },
                { label: "Month", value: `${visibleTokenBudget.remainingMonth} tokens` },
                { label: "Estimate", value: `${visibleTokenBudget.requestEstimate} tokens` },
                { label: "Reset", value: "tomorrow" }
              ]}
            />
          </SectionCard>
          <SectionCard eyebrow="Usage Log" title="Logs">
            <DataTable
              columns={[
                { key: "prompt", label: "Prompt" },
                { key: "scenario", label: "Scenario" },
                { key: "tokens", label: "Tokens" },
                { key: "result", label: "Result" }
              ]}
              rows={visibleUsage}
            />
          </SectionCard>
          <DecisionPanel
            tone="success"
            badge="Allowed"
            title="Guardrail result recorded before generation"
            lines={[
              "No provider secret visible",
              "Usage log persisted",
              "Preview refreshed from latest task"
            ]}
          />
        </aside>
      </section>
    </>
  );
}
