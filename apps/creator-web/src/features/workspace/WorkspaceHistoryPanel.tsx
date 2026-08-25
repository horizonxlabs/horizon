import { GitCommit, Wrench } from "lucide-react";
import { VibeRestorePoint } from "./VibeRestorePoint";
import { buildVersionHistory } from "./vibe-history";
import type { VibeMessage } from "./vibe-stream";

// Lovable-style history tab: every committed turn is a version, titled by the prompt that
// created it. Restoring is a user decision made HERE — never automatic, never inline chat.
export function WorkspaceHistoryPanel({
  projectId,
  messages,
  disabled,
  onRestored
}: {
  projectId: string;
  messages: VibeMessage[];
  disabled: boolean;
  onRestored: () => void;
}) {
  const versions = buildVersionHistory(messages);
  if (versions.length === 0) {
    return (
      <div className="hz-db-empty" role="status">
        No versions yet. Each successful AI build is saved here so you can restore it later.
      </div>
    );
  }
  return (
    <div className="vibe-history-panel" aria-label="Version history">
      <p className="vibe-history-hint">
        Choose a version created from a previous prompt. Restoring it removes all later changes.
      </p>
      <ol className="vibe-history-list">
        {versions.map((version) => (
          <li
            key={version.commitSha}
            className={`vibe-history-item${version.isCurrent ? " is-current" : ""}`}
          >
            <span className="vibe-history-badge">
              {version.isAutoDebug ? <Wrench size={13} /> : <GitCommit size={13} />}
              v{version.version}
            </span>
            <div className="vibe-history-body">
              <span className="vibe-history-prompt" title={version.prompt}>
                {version.prompt}
              </span>
              <span className="vibe-history-sha">⑂ {version.commitSha.slice(0, 8)}</span>
            </div>
            {version.isCurrent ? (
              <span className="vibe-history-current">Current</span>
            ) : (
              <VibeRestorePoint
                projectId={projectId}
                commitSha={version.commitSha}
                disabled={disabled}
                onRestored={onRestored}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
