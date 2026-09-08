import {
  Circle,
  Database,
  FilePlus2,
  FolderOpen,
  Image,
  PencilLine,
  Search,
  Terminal
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { actionLineCount, vibeActionVerb, type VibeAction } from "./vibe-actions";

export function VibeActionRow({ action }: { action: VibeAction }): ReactNode {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(action.find || action.replace || action.body || action.error);
  const running = action.status === "running";
  const failed = action.status === "failed";
  const expanded = running || open;
  const statusClass = running ? "running" : failed ? "failed" : "complete";
  const isDiff = action.find !== undefined || action.replace !== undefined;
  const lineCount = actionLineCount(action);
  const ActionIcon =
    action.type === "read"
      ? Search
      : action.type === "list"
        ? FolderOpen
        : action.type === "file"
          ? FilePlus2
          : action.type === "edit"
            ? PencilLine
            : action.type === "shell"
              ? Terminal
              : action.type === "migration"
                ? Database
                : action.type === "image"
                  ? Image
                  : Circle;

  return (
    <div className={`vibe-action-row vibe-action-row-${statusClass}`}>
      <button
        type="button"
        onClick={() => hasBody && !running && setOpen((o) => !o)}
        className="vibe-action-summary"
        aria-expanded={hasBody ? expanded : undefined}
      >
        <span className="vibe-action-icon" aria-hidden="true">
          <ActionIcon size={14} strokeWidth={1.8} />
        </span>
        <span className={`vibe-action-verb ${running ? "vibe-shimmer" : ""}`.trim()}>
          {vibeActionVerb(action.type, action.status)}
        </span>
        <span className="vibe-action-label">{action.label}</span>
        {lineCount > 0 && (
          <span className="vibe-action-lines" aria-live={running ? "polite" : undefined}>
            {lineCount} lines
          </span>
        )}
        {hasBody && <span className="vibe-action-toggle">{expanded ? "▾" : "▸"}</span>}
      </button>
      {expanded && hasBody && (
        <div className="vibe-action-details">
          {/* Show the error AND what Pi attempted (diff/body), when both are known — a failed
              edit is only debuggable if you can see the snippet it tried alongside why it failed. */}
          {action.error && <pre className="vibe-action-error">{action.error}</pre>}
          {isDiff ? (
            <pre className="vibe-action-diff">
              <span className="vibe-action-diff-heading">Before</span>
              {(action.find ?? "").split("\n").map((line, i) => (
                <span className="vibe-action-diff-remove" key={`f${i}`}>
                  - {line}
                </span>
              ))}
              <span className="vibe-action-diff-heading">After</span>
              {(action.replace ?? "").split("\n").map((line, i) => (
                <span className="vibe-action-diff-add" key={`r${i}`}>
                  + {line}
                </span>
              ))}
            </pre>
          ) : (
            <>
              {action.type === "shell" && (
                <pre className="vibe-action-command">$ {action.label}</pre>
              )}
              {action.body ? (
                <pre className="vibe-action-body">{action.body}</pre>
              ) : action.type === "shell" && running ? (
                <span className="vibe-action-output-pending">Waiting for output…</span>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
