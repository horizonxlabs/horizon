import { useState, type ReactNode } from "react";
import { vibeActionIcon, vibeActionVerb, type VibeAction } from "../lib/vibe-actions";

export function VibeActionRow({ action }: { action: VibeAction }): ReactNode {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(action.find || action.replace || action.body || action.error);
  const running = action.status === "running";
  const failed = action.status === "failed";
  const statusClass = running ? "running" : failed ? "failed" : "complete";
  const isDiff = action.find !== undefined || action.replace !== undefined;

  return (
    <div className={`vibe-action-row vibe-action-row-${statusClass}`}>
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        className="vibe-action-summary"
        aria-expanded={hasBody ? open : undefined}
      >
        <span aria-hidden>{vibeActionIcon(action.type)}</span>
        <span className={`vibe-action-verb ${running ? "vibe-shimmer" : ""}`.trim()}>
          {running ? "" : failed ? "✗ " : "✓ "}
          {vibeActionVerb(action.type, action.status)}
        </span>
        <span className="vibe-action-label">{action.label}</span>
        {hasBody && <span className="vibe-action-toggle">{open ? "▾" : "▸"}</span>}
      </button>
      {open && hasBody && (
        <div className="vibe-action-details">
          {action.error ? (
            <pre className="vibe-action-error">{action.error}</pre>
          ) : isDiff ? (
            <pre className="vibe-action-diff">
              {(action.find ?? "").split("\n").map((line, i) => (
                <div className="vibe-action-diff-remove" key={`f${i}`}>
                  - {line}
                </div>
              ))}
              {(action.replace ?? "").split("\n").map((line, i) => (
                <div className="vibe-action-diff-add" key={`r${i}`}>
                  + {line}
                </div>
              ))}
            </pre>
          ) : (
            <pre className="vibe-action-body">{action.body}</pre>
          )}
        </div>
      )}
    </div>
  );
}
