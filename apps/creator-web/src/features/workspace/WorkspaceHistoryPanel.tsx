import { CheckCircle2, GitCommit, History, Info, Wrench } from "lucide-react";
import { CreatorEmptyState } from "@/shared/CreatorEmptyState";
import { VibeRestorePoint } from "./VibeRestorePoint";
import { buildVersionHistory } from "./vibe-history";
import type { VibeMessage } from "./vibe-stream";

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
  return (
    <section className="vibe-history-panel" aria-label="Version history">
      <div className="vibe-history-content">
        <header className="vibe-history-header">
          <span className="vibe-history-icon" aria-hidden="true">
            <History size={20} />
          </span>
          <div>
            <h2>Version history</h2>
            <p>Revisit the changes that shaped your app.</p>
          </div>
          <span className="vibe-history-count">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </span>
        </header>
        {versions.length === 0 ? (
          <div className="vibe-history-empty">
            <CreatorEmptyState
              title="No versions yet"
              description="Every successful AI build becomes a version you can return to. Start a conversation to create your first one."
            />
          </div>
        ) : (
          <>
            <p className="vibe-history-hint">
              <Info size={15} aria-hidden="true" />
              Restoring a version replaces the workspace code and removes all later changes.
            </p>
            <ol className="vibe-history-list" aria-label="Saved versions, newest first">
              {versions.map((version) => (
                <li
                  key={version.commitSha}
                  className={["vibe-history-item", version.isCurrent ? "is-current" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={version.isCurrent ? "true" : undefined}
                >
                  <span className="vibe-history-badge" aria-label={`Version ${version.version}`}>
                    v{version.version}
                  </span>
                  <div className="vibe-history-body">
                    <p className="vibe-history-prompt" title={version.prompt}>
                      {version.prompt || "Workspace update"}
                    </p>
                    <div className="vibe-history-meta">
                      <span className="vibe-history-sha" title={version.commitSha}>
                        <GitCommit size={14} aria-hidden="true" />
                        <code>{version.commitSha.slice(0, 8)}</code>
                      </span>
                      <span className="vibe-history-kind">
                        {version.isAutoDebug ? <Wrench size={13} aria-hidden="true" /> : null}
                        {version.isAutoDebug ? "Automatic fix" : "Prompt update"}
                      </span>
                    </div>
                  </div>
                  <div className="vibe-history-actions">
                    {version.isCurrent ? (
                      <span className="vibe-history-current">
                        <CheckCircle2 size={14} aria-hidden="true" /> Current
                      </span>
                    ) : (
                      <VibeRestorePoint
                        projectId={projectId}
                        commitSha={version.commitSha}
                        disabled={disabled}
                        onRestored={onRestored}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
