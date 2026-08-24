import { Bug, Wrench, X } from "lucide-react";
import { createBugFixPrompt, type BugReport } from "./vibe-bugs";

// Sits OUTSIDE the chat thread, above the composer. Every detected problem waits here
// until the user presses "Fix bug" — nothing runs automatically.
export function BugReportBox({
  bugs,
  disabled,
  onFix,
  onDismiss
}: {
  bugs: BugReport[];
  disabled: boolean;
  onFix: (message: string) => void;
  onDismiss: (signature: string) => void;
}) {
  if (!bugs.length) return null;
  return (
    <section className="vibe-bug-box" aria-label="Bug reports">
      <div className="vibe-bug-box-head">
        <Bug size={13} aria-hidden="true" />
        <span>Detected issues ({bugs.length})</span>
      </div>
      <ul className="vibe-bug-list">
        {bugs.map((bug) => (
          <li key={bug.signature} className="vibe-bug-item">
            <div className="vibe-bug-body">
              <span className="vibe-bug-message" title={bug.message}>
                {bug.message}
              </span>
              <span className="vibe-bug-meta">
                {bug.file ?? bug.source}
                {bug.platformBug ? " · template" : ""}
              </span>
            </div>
            <button
              type="button"
              className="vibe-bug-fix"
              disabled={disabled}
              onClick={() => onFix(createBugFixPrompt(bug))}
            >
              <Wrench size={12} />
              Fix bug
            </button>
            <button
              type="button"
              className="vibe-bug-dismiss"
              aria-label={`Dismiss report: ${bug.message}`}
              onClick={() => onDismiss(bug.signature)}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
