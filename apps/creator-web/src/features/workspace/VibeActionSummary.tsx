import { ListChecks, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { VibeActionRow } from "./VibeActionRow";
import { summarizeActions, type VibeAction } from "./vibe-actions";

function activityLabel(actions: VibeAction[]): string {
  const types = new Set(actions.map((action) => action.type));
  const hasFiles = types.has("file") || types.has("edit");
  const hasChecks = types.has("shell");
  const hasInspection = types.has("read") || types.has("list") || types.has("skill");

  if (types.has("image") && hasFiles) return "Generated images and updated files";
  if (types.has("image")) return "Generated visual assets";
  if (types.has("migration")) return "Prepared database changes";
  if (hasFiles && hasChecks) return "Edited files and ran checks";
  if (hasFiles) return "Edited project files";
  if (hasChecks) return "Ran project checks";
  if (hasInspection) return "Loaded tools and read files";
  return "Project activity";
}

// Non-programmer view of a turn's work: while running, only the CURRENT action row shows
// (with its live line counter); when done, everything rolls up into one summary line that
// expands to the full per-file detail on demand.
export function VibeActionSummary({ actions }: { actions: VibeAction[] }): ReactNode {
  if (!actions.length) return null;
  const summary = summarizeActions(actions);
  const isActive = summary.running > 0;
  const phaseLabel = activityLabel(actions);
  const completedLabel = `${actions.length} ${actions.length === 1 ? "step" : "steps"} completed`;
  const evidence = [
    summary.lines > 0 ? `${summary.lines} lines` : "",
    summary.failed > 0 ? `${summary.failed} failed` : ""
  ]
    .filter(Boolean)
    .join(" · ");
  const visibleActions = isActive
    ? actions.filter((action) => action.status === "running")
    : actions;
  const StatusIcon = isActive ? LoaderCircle : summary.failed > 0 ? TriangleAlert : ListChecks;

  return (
    <details
      className={`vibe-technical-details${summary.failed > 0 ? " has-failed" : ""}`}
      open={isActive || undefined}
    >
      <summary className="vibe-action-rollup">
        <span className="vibe-action-rollup-icon" aria-hidden="true">
          <StatusIcon size={15} strokeWidth={1.9} />
        </span>
        <span className="vibe-action-rollup-title">Activity</span>
        <span className="vibe-action-rollup-meta">
          {phaseLabel} · {isActive ? "Working" : completedLabel}
          {evidence ? ` · ${evidence}` : ""}
        </span>
      </summary>
      <div className="vibe-technical-details-body vibe-message-actions">
        {visibleActions.map((action, index) => (
          <VibeActionRow key={`${action.id}:${index}`} action={action} />
        ))}
      </div>
    </details>
  );
}
