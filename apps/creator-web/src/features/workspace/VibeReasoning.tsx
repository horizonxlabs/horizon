import { useEffect, useRef, type ReactNode } from "react";

// Collapsible "thinking" block for a reasoning model's streamed chain-of-thought. Kept separate
// from the assistant's answer and from tool/action rows (opencode-style): reasoning is never parsed
// as code. Auto-expands (and follows its own scroll) while the model is still thinking; once the
// answer starts, `live` goes false — it relabels to "Thought process" and collapses.
export function VibeReasoning({ reasoning, live }: { reasoning: string; live: boolean }): ReactNode {
  const textRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = textRef.current;
    if (el && live) el.scrollTop = el.scrollHeight;
  }, [reasoning, live]);
  return (
    <details className="vibe-reasoning" open={live || undefined}>
      <summary className="vibe-reasoning-summary">
        <span aria-hidden>💭</span>
        <span className={`vibe-reasoning-title ${live ? "vibe-shimmer" : ""}`.trim()}>
          {live ? "Working · implementation reasoning" : "View implementation reasoning"}
        </span>
      </summary>
      <pre ref={textRef} className="vibe-reasoning-text">{reasoning}</pre>
    </details>
  );
}
