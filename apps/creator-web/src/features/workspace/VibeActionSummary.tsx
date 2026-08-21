import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { VibeActionRow } from "./VibeActionRow";
import { summarizeActions, type VibeAction } from "./vibe-actions";

// Non-programmer view of a turn's work: while running, only the CURRENT action row shows
// (with its live line counter); when done, everything rolls up into one summary line that
// expands to the full per-file detail on demand.
export function VibeActionSummary({ actions }: { actions: VibeAction[] }): ReactNode {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  const summary = summarizeActions(actions);
  const runningActions = actions.filter((action) => action.status === "running");
  const label =
    `${summary.done > 0 ? `ดำเนินการ ${summary.done} รายการ` : ""}` +
    `${summary.lines > 0 ? ` · ${summary.lines} lines` : ""}` +
    `${summary.failed > 0 ? ` · ล้มเหลว ${summary.failed}` : ""}`;

  if (actions.length <= 2 && runningActions.length === 0) {
    return (
      <div className="vibe-message-actions">
        {actions.map((action, index) => (
          <VibeActionRow key={`${action.id}:${index}`} action={action} />
        ))}
      </div>
    );
  }

  return (
    <div className="vibe-message-actions">
      <button
        type="button"
        className={`vibe-action-rollup${summary.failed > 0 ? " has-failed" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>
          {summary.running > 0 ? "⚙ กำลังทำงาน" : summary.failed > 0 ? "⚠" : "✓"} {label.trim()}
        </span>
      </button>
      {open &&
        actions.map((action, index) => (
          <VibeActionRow key={`${action.id}:${index}`} action={action} />
        ))}
      {!open &&
        runningActions.map((action, index) => (
          <VibeActionRow key={`run-${action.id}:${index}`} action={action} />
        ))}
    </div>
  );
}
