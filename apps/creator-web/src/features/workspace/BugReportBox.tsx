import { Bug, Wrench, X } from "lucide-react";
import { buildFixAllMessage, buildFixMessage, type BugReport } from "./vibe-bugs";

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
        <span>พบปัญหา ({bugs.length})</span>
        {bugs.length > 1 ? (
          <button
            type="button"
            className="vibe-bug-fix vibe-bug-fix-all"
            disabled={disabled}
            onClick={() => onFix(buildFixAllMessage(bugs))}
          >
            <Wrench size={12} />
            Fix ทั้งหมด
          </button>
        ) : null}
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
              onClick={() => onFix(buildFixMessage(bug))}
            >
              <Wrench size={12} />
              Fix bug
            </button>
            <button
              type="button"
              className="vibe-bug-dismiss"
              aria-label={`ปิดรายงาน: ${bug.message}`}
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
