import type { ReactNode } from "react";
import { VibeActionRow } from "./VibeActionRow";
import { summarizeActions, type VibeAction } from "./vibe-actions";

// Non-programmer view of a turn's work: while running, only the CURRENT action row shows
// (with its live line counter); when done, everything rolls up into one summary line that
// expands to the full per-file detail on demand.
export function VibeActionSummary({ actions }: { actions: VibeAction[] }): ReactNode {
  if (!actions.length) return null;
  const summary = summarizeActions(actions);
  const isActive = summary.running > 0;
  const completedLabel = `${actions.length} completed technical action${
    actions.length === 1 ? "" : "s"
  }`;
  const evidence = [
    summary.lines > 0 ? `${summary.lines} lines` : "",
    summary.failed > 0 ? `${summary.failed} failed` : ""
  ].filter(Boolean).join(" · ");

  return (
    <details
      className={`vibe-technical-details${summary.failed > 0 ? " has-failed" : ""}`}
      open={isActive || undefined}
    >
      <summary className="vibe-action-rollup">
        <span aria-hidden="true">{isActive ? "⚙" : summary.failed > 0 ? "⚠" : "✓"}</span>
        <span>
          {isActive ? "Working" : completedLabel}
          {evidence ? ` · ${evidence}` : ""}
        </span>
      </summary>
      <div className="vibe-technical-details-body vibe-message-actions">
        {actions.map((action, index) => (
          <VibeActionRow key={`${action.id}:${index}`} action={action} />
        ))}
      </div>
    </details>
  );
}
