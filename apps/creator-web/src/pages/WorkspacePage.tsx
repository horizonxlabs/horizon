import { Send } from "lucide-react";
import { VibeActionRow } from "../components/VibeActionRow";
import { WorkspaceDatabasePanel } from "../components/WorkspaceDatabasePanel";
import { platformSessionToken } from "../lib/session";
import type { useCreatorApp } from "../hooks/use-creator-app";

const WORKSPACE_TABS = ["preview", "code", "database"] as const;
const TAB_LABELS: Record<(typeof WORKSPACE_TABS)[number], string> = {
  preview: "Preview",
  code: "Code",
  database: "Database"
};

export function WorkspacePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    isVibing,
    vibeStatus,
    vibeTab,
    setVibeTab,
    setVibePreviewKey,
    vibeMessages,
    promptDraft,
    setPromptDraft,
    handleVibeChat,
    vibePreviewKey
  } = app;
  // Preview is addressed by the id-derived resource key (matches the container name), not the
  // public slug, so it survives a rename. Project ids never contain hyphens.
  const previewKey = selectedProject.id.replaceAll("_", "-");
  const previewSrc = `/preview/${previewKey}?token=${encodeURIComponent(platformSessionToken() ?? "")}`;
  return (
    <div className="vibe-live-shell">
      <header className="vibe-live-header">
        <a className="vibe-live-back-link" href="/creator/projects">
          ‹ Projects
        </a>
        <div className="vibe-live-divider" />
        <strong className="vibe-live-project-name">{selectedProject.name}</strong>
        <span className={`vibe-live-status-dot ${isVibing ? "is-running" : "is-ready"}`} />
        <span className="vibe-live-status-text">{vibeStatus || "ready"}</span>
        <div className="vibe-live-tabs" role="tablist" aria-label="Workspace view">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setVibeTab(tab)}
              className={`vibe-live-tab ${vibeTab === tab ? "is-active" : ""}`.trim()}
              role="tab"
              aria-selected={vibeTab === tab}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVibePreviewKey((key) => key + 1)}
          title="Refresh preview"
          className="vibe-live-control"
        >
          ↻
        </button>
        <a href={previewSrc} target="_blank" rel="noreferrer" className="vibe-live-control">
          Open ↗
        </a>
        <button
          type="button"
          title="Publish to production (Plan 5 pipeline)"
          className="vibe-live-control vibe-live-control-primary"
        >
          Publish
        </button>
      </header>
      <div className="vibe-live-body">
        <div className="vibe-live-chat-panel">
          <div className="vibe-live-thread">
            {vibeMessages.length === 0 && !isVibing && (
              <div className="vibe-live-empty">
                <div className="vibe-live-empty-icon">✨</div>
                <div className="vibe-live-empty-title">Build with AI</div>
                Describe what you want. The AI writes code into your live app, runs it, and commits
                each change.
              </div>
            )}
            {vibeMessages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="vibe-message vibe-message-user">
                  {message.text}
                </div>
              ) : (
                <div key={message.id} className="vibe-message vibe-message-assistant">
                  <div className="vibe-message-text">{message.text || (isVibing ? "▋" : "")}</div>
                  {message.actions.length > 0 && (
                    <div className="vibe-message-actions">
                      {message.actions.map((action) => (
                        <VibeActionRow key={action.id} action={action} />
                      ))}
                    </div>
                  )}
                  {message.commitSha && (
                    <div className="vibe-commit-chip">
                      ⑂ committed {message.commitSha.slice(0, 8)}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          <div className="vibe-live-suggestions">
            {["Add an about page", "Make it dark mode", "Add a contact form"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="vibe-live-suggestion"
                onClick={() => setPromptDraft(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div className="vibe-live-composer-wrap">
            <div className="vibe-live-composer">
              <textarea
                aria-label="Ask AI to build"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isVibing && promptDraft.trim()) void handleVibeChat();
                  }
                }}
                placeholder="Ask AI to build…"
                rows={1}
                className="vibe-live-input"
              />
              <button
                type="button"
                onClick={handleVibeChat}
                disabled={isVibing || !promptDraft.trim()}
                aria-label="Send prompt"
                className="vibe-live-send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="vibe-live-preview-panel">
          {vibeTab === "preview" ? (
            <iframe
              key={vibePreviewKey}
              title="Live preview"
              src={previewSrc}
              className="vibe-live-iframe"
            />
          ) : vibeTab === "database" ? (
            <WorkspaceDatabasePanel projectId={selectedProject.id} />
          ) : (
            <div className="vibe-live-code-panel">
              <div className="vibe-live-code-title">Changes this session</div>
              {vibeMessages.flatMap((message) => message.actions).length === 0 ? (
                <div className="vibe-live-code-empty">
                  No changes yet. Ask the AI to build something.
                </div>
              ) : (
                <div className="vibe-live-action-stack">
                  {vibeMessages
                    .flatMap((message) => message.actions)
                    .map((action, index) => (
                      <VibeActionRow key={`${action.id}-${index}`} action={action} />
                    ))}
                </div>
              )}
              <div className="vibe-live-code-note">
                A full file browser is on the roadmap — use the Preview tab to see the running app.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
