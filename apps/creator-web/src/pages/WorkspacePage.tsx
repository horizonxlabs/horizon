import { ClipboardList, Hammer, Plus, Send } from "lucide-react";
import type { WorkspaceAgentMode } from "@evcp/api-client";
import { Suspense, lazy } from "react";
import { VibeActionRow } from "../components/VibeActionRow";
import { WorkspaceCodePanel } from "../components/WorkspaceCodePanel";
import { platformSessionToken } from "../lib/session";
import type { useCreatorApp } from "../hooks/use-creator-app";

// react-data-grid (and its CSS) is client-only; lazy-load it so importing WorkspacePage in
// Node test environments (render-smoke) never pulls in the CSS/grid module.
const WorkspaceDatabasePanel = lazy(() => import("../components/WorkspaceDatabasePanel"));

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
  { value: "plan", label: "Plan", description: "Read-only analysis", Icon: ClipboardList },
  { value: "build", label: "Build", description: "Apply changes", Icon: Hammer }
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
    projectFiles,
    selectedAttachmentIds,
    isUploadingProjectFile,
    projectFileMessage,
    toggleProjectFileAttachment,
    handleUploadProjectFiles,
    workspaceMode,
    setWorkspaceMode
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
                  ? "Ask analysis, tradeoffs, and implementation steps before changes are applied."
                  : "Describe what you want. The AI writes code into your live app, runs it, and commits each change."}
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
          <div className="vibe-live-files">
            {projectFileMessage && (
              <span className="vibe-live-file-message">{projectFileMessage}</span>
            )}
            {projectFiles.length > 0 && (
              <div className="vibe-live-file-list" aria-label="Project files">
                {projectFiles.map((file) => {
                  const selected = selectedAttachmentIds.includes(file.id);
                  const ready =
                    file.uploadStatus === "uploaded" &&
                    file.scanStatus === "clean" &&
                    file.indexStatus === "indexed";
                  return (
                    <button
                      key={file.id}
                      type="button"
                      className={`vibe-live-file-chip ${selected ? "is-selected" : ""}`.trim()}
                      onClick={() => toggleProjectFileAttachment(file.id)}
                      disabled={!ready}
                      title={ready ? "Attach to next prompt" : "File is not ready yet"}
                    >
                      <span>{file.fileName}</span>
                      <small>{ready ? "ready" : file.indexStatus}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="vibe-live-composer-wrap">
            <div className="vibe-live-composer">
              <textarea
                aria-label={workspaceMode === "plan" ? "Ask AI to plan" : "Ask AI to build"}
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isVibing && promptDraft.trim()) void handleVibeChat();
                  }
                }}
                placeholder={
                  workspaceMode === "plan" ? "Ask for plan or review..." : "Ask AI to build…"
                }
                rows={1}
                className="vibe-live-input"
              />
              <div className="vibe-composer-footer">
                <label className="vibe-composer-attach" title="แนบไฟล์">
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      if (event.currentTarget.files)
                        void handleUploadProjectFiles(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                    disabled={isUploadingProjectFile}
                  />
                  <Plus size={18} />
                </label>
                <div className="vibe-composer-right">
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
                        <Icon size={13} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleVibeChat()}
                    disabled={isVibing || !promptDraft.trim()}
                    aria-label="Send prompt"
                    className="vibe-live-send"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
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
            <Suspense fallback={<div className="hz-db-empty">กำลังโหลด Database…</div>}>
              <WorkspaceDatabasePanel projectId={selectedProject.id} />
            </Suspense>
          ) : (
            <WorkspaceCodePanel projectId={selectedProject.id} />
          )}
        </div>
      </div>
    </div>
  );
}
