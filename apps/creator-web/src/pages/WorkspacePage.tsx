import { ClipboardList, ExternalLink, Hammer, RefreshCw, Send } from "lucide-react";
import type { WorkspaceAgentMode } from "@evcp/api-client";
import { VibeActionRow } from "../components/VibeActionRow";
import { WorkspaceDatabasePanel } from "../components/WorkspaceDatabasePanel";
import type { useCreatorApp } from "../hooks/use-creator-app";
import { platformSessionToken } from "../lib/session";

const WORKSPACE_TABS = ["preview", "code", "database"] as const;
const TAB_LABELS: Record<(typeof WORKSPACE_TABS)[number], string> = {
  preview: "Preview",
  code: "Code",
  database: "Database"
};

const MODE_OPTIONS: Array<{
  value: WorkspaceAgentMode;
  label: string;
  description: string;
  Icon: typeof ClipboardList;
}> = [
  {
    value: "plan",
    label: "Plan",
    description: "Read-only analysis",
    Icon: ClipboardList
  },
  {
    value: "build",
    label: "Build",
    description: "Apply changes",
    Icon: Hammer
  }
];

const SUGGESTIONS: Record<WorkspaceAgentMode, string[]> = {
  plan: ["Review current workspace", "Draft an implementation plan", "List delivery risks"],
  build: ["Add an about page", "Make it dark mode", "Add a contact form"]
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
    vibePreviewKey,
    workspaceMode,
    setWorkspaceMode
  } = app;

  // Preview is addressed by the id-derived resource key (matches the container name), not the
  // public slug, so it survives a rename. Project ids never contain hyphens.
  const previewKey = selectedProject.id.replaceAll("_", "-");
  const previewSrc = `/preview/${previewKey}?token=${encodeURIComponent(platformSessionToken() ?? "")}`;
  const flattenedActions = vibeMessages.flatMap((message) => message.actions);

  return (
    <div className="vibe-live-shell">
      <header className="vibe-live-header">
        <a className="vibe-live-back-link" href="/creator/projects">
          &lt; Projects
        </a>
        <div className="vibe-live-divider" />
        <strong className="vibe-live-project-name">{selectedProject.name}</strong>
        <span className={`vibe-live-status-dot ${isVibing ? "is-running" : "is-ready"}`} />
        <span className="vibe-live-status-text">{vibeStatus || "ready"}</span>

        <div className="vibe-mode-switch" role="group" aria-label="Workspace mode">
          {MODE_OPTIONS.map(({ value, label, description, Icon }) => (
            <button
              key={value}
              type="button"
              className={`vibe-mode-option ${workspaceMode === value ? "is-active" : ""}`.trim()}
              onClick={() => setWorkspaceMode(value)}
              aria-pressed={workspaceMode === value}
              title={description}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>

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
          <RefreshCw size={15} />
        </button>
        <a href={previewSrc} target="_blank" rel="noreferrer" className="vibe-live-control">
          <ExternalLink size={15} />
          Open
        </a>
        <button
          type="button"
          title="Publish to production"
          className="vibe-live-control vibe-live-control-primary"
          disabled={workspaceMode === "plan"}
        >
          Publish
        </button>
      </header>

      <div className="vibe-live-body">
        <div className="vibe-live-chat-panel">
          <div className="vibe-live-thread">
            {vibeMessages.length === 0 && !isVibing && (
              <div className="vibe-live-empty">
                <div className="vibe-live-empty-title">
                  {workspaceMode === "plan" ? "Plan with AI" : "Build with AI"}
                </div>
                {workspaceMode === "plan"
                  ? "Ask for analysis, tradeoffs, and implementation steps before changes are applied."
                  : "Describe what you want. The AI writes code into your live app and commits each change."}
              </div>
            )}

            {vibeMessages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="vibe-message vibe-message-user">
                  {message.text}
                </div>
              ) : (
                <div key={message.id} className="vibe-message vibe-message-assistant">
                  <div className="vibe-message-text">{message.text || (isVibing ? "|" : "")}</div>
                  {message.actions.length > 0 && (
                    <div className="vibe-message-actions">
                      {message.actions.map((action) => (
                        <VibeActionRow key={action.id} action={action} />
                      ))}
                    </div>
                  )}
                  {message.commitSha && (
                    <div className="vibe-commit-chip">
                      committed {message.commitSha.slice(0, 8)}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <div className="vibe-live-suggestions">
            {SUGGESTIONS[workspaceMode].map((suggestion) => (
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
                aria-label={workspaceMode === "plan" ? "Ask AI plan" : "Ask AI build"}
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isVibing && promptDraft.trim()) void handleVibeChat();
                  }
                }}
                placeholder={
                  workspaceMode === "plan" ? "Ask for a plan or review..." : "Ask AI build..."
                }
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
              <div className="vibe-live-code-title">Changes session</div>
              {flattenedActions.length === 0 ? (
                <div className="vibe-live-code-empty">
                  {workspaceMode === "plan"
                    ? "No changes in Plan mode."
                    : "No changes yet. Ask AI to build something."}
                </div>
              ) : (
                <div className="vibe-live-action-stack">
                  {flattenedActions.map((action, index) => (
                    <VibeActionRow key={`${action.id}-${index}`} action={action} />
                  ))}
                </div>
              )}
              <div className="vibe-live-code-note">
                A full file browser is on the roadmap. Use Preview to see the running app.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
