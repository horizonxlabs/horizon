import { Sparkles } from "lucide-react";

// Always-visible affordance while a turn runs, pinned above the composer. The header pill
// and the in-message text cursor are easy to miss, so mid-turn pauses (validation, tool
// rounds) read as "done or stuck" — this row keeps moving until the turn truly ends.
export function VibeWorkingIndicator({ active, status }: { active: boolean; status: string }) {
  if (!active) return null;
  return (
    <div className="vibe-working" role="status" aria-live="polite">
      <span className="vibe-working-icon" aria-hidden="true">
        <Sparkles size={14} />
      </span>
      <span className="vibe-working-label">{status || "AI is working…"}</span>
      <span className="vibe-working-dots" aria-hidden="true">
        <i className="vibe-working-dot" />
        <i className="vibe-working-dot" />
        <i className="vibe-working-dot" />
      </span>
    </div>
  );
}
