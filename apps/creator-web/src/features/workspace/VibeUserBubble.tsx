import type { ReactNode } from "react";

// Server-initiated auto-debug prompts are stored as user messages (the chat log stays
// honest) but must not look like something the human typed — render them as a system chip.
export const AUTO_DEBUG_PREFIX = "[AUTO-DEBUG]";

export function VibeUserBubble({ text, className = "" }: { text: string; className?: string }): ReactNode {
  if (text.startsWith(AUTO_DEBUG_PREFIX)) {
    const summary = text.slice(AUTO_DEBUG_PREFIX.length).split("\n")[0].trim();
    return (
      <div className={`vibe-autodebug-chip ${className}`.trim()} role="status">
        🔧 Automated system fix
        <span title={text}>{summary.slice(0, 120)}</span>
      </div>
    );
  }
  return <div className={`vibe-message vibe-message-user ${className}`.trim()}>{text}</div>;
}
