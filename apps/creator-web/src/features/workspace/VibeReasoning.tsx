import { useState, type ReactNode } from "react";

// Collapsible "thinking" block for a reasoning model's streamed chain-of-thought. Kept separate
// from the assistant's answer and from tool/action rows (opencode-style): reasoning is never parsed
// as code. Auto-expands while it is still streaming, collapses to a one-line summary once done.
export function VibeReasoning({ reasoning, live }: { reasoning: string; live: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  const expanded = open || live;
  return (
    <div className="vibe-reasoning">
      <button
        type="button"
        className="vibe-reasoning-summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
      >
        <span aria-hidden>💭</span>
        <span className={`vibe-reasoning-title ${live ? "vibe-shimmer" : ""}`.trim()}>
          {live ? "Thinking…" : "Thought process"}
        </span>
        <span className="vibe-reasoning-toggle">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <pre className="vibe-reasoning-text">{reasoning}</pre>}
    </div>
  );
}
