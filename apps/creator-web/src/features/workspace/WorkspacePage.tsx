import {
  ArrowUpRight,
  ChevronLeft,
  ClipboardList,
  Hammer,
  Plus,
  RotateCw,
  Send
} from "lucide-react";
import type { WorkspaceAgentMode } from "@evcp/api-client";
import { Button, Tabs, Textarea } from "@evcp/ui";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { PublishDialog } from "@/features/publish";
import { QuickMessages } from "./QuickMessages";
import { VibeActionRow } from "./VibeActionRow";
import { VibeReasoning } from "./VibeReasoning";
import { VibeMarkdown } from "./VibeMarkdown";
import { WorkspaceCodePanel } from "./WorkspaceCodePanel";
import { buildQuickMessages } from "./quick-messages";
import { stripSuggestions } from "./vibe-suggest";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { useCreatorApp } from "@/app/use-creator-app";

// react-data-grid (and its CSS) is client-only; lazy-load it so importing WorkspacePage in
// Node test environments (render-smoke) never pulls in the CSS/grid module.
const WorkspaceDatabasePanel = lazy(() => import("./WorkspaceDatabasePanel"));

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

export function WorkspacePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    currentPrdVersion,
    isVibing,
    vibeStatus,
    vibeTab,
    setVibeTab,
    setVibePreviewKey,
    vibeMessages,
    promptDraft,
    setPromptDraft,
    handleVibeChat,
    approveAndImplement,
    vibePreviewKey,
    projectFiles,
    selectedAttachmentIds,
    isUploadingProjectFile,
    projectFileMessage,
    toggleProjectFileAttachment,
    handleUploadProjectFiles,
    workspaceMode,
    setWorkspaceMode,
    hasPreview
  } = app;
  const [showPublish, setShowPublish] = useState(false);
  // Auto-scroll the chat thread to the bottom as messages/tokens/reasoning stream in, so the
  // reply is always in view — but only while the user is already near the bottom, so scrolling
  // up to read earlier output is never yanked back down.
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const handleThreadScroll = () => {
    const el = threadRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [vibeMessages, isVibing, vibeStatus]);
  const [previewAuthorizationState, setPreviewAuthorizationState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [previewAuthorizationAttempt, setPreviewAuthorizationAttempt] = useState(0);
  const [authorizedPreviewRequestKey, setAuthorizedPreviewRequestKey] = useState("");
  // Preview is addressed by the id-derived resource key (matches the container name), not the
  // public slug, so it survives a rename. Project ids never contain hyphens.
  const previewKey = selectedProject.id.replaceAll("_", "-");
  const previewSrc = `/preview/${previewKey}`;
  const previewRequestKey = `${selectedProject.id}:${vibePreviewKey}:${previewAuthorizationAttempt}`;
  const isPreviewAuthorized =
    previewAuthorizationState === "ready" &&
    authorizedPreviewRequestKey === previewRequestKey;
  const quickMessages = buildQuickMessages({
    mode: workspaceMode,
    project: selectedProject,
    prdSummary: currentPrdVersion?.changeSummary,
    prdSections: currentPrdVersion?.sections,
    messages: vibeMessages,
    hasPreview,
    hasProjectFiles: projectFiles.length > 0
  });
  useEffect(() => {
    let active = true;
    setPreviewAuthorizationState("loading");
    setAuthorizedPreviewRequestKey("");
    void createCreatorPlatformClient()
      .authorizeWorkspacePreview(selectedProject.id)
      .then(() => {
        if (active) {
          setAuthorizedPreviewRequestKey(previewRequestKey);
          setPreviewAuthorizationState("ready");
        }
      })
      .catch(() => {
        if (active) setPreviewAuthorizationState("error");
      });
    return () => {
      active = false;
    };
  }, [selectedProject.id, vibePreviewKey, previewAuthorizationAttempt]);
  return (
    <div className="vibe-live-shell">
      <header className="vibe-live-header">
        <div className="vibe-live-header-left">
          <a className="vibe-live-back-link" href="/creator/">
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Projects</span>
          </a>
          <div className="vibe-live-divider" />
          <strong className="vibe-live-project-name">{selectedProject.name}</strong>
          <span className={`vibe-live-status ${isVibing ? "is-running" : "is-ready"}`.trim()}>
            <span className="vibe-live-status-dot" />
            {vibeStatus || "ready"}
          </span>
        </div>
        <div className="vibe-live-header-right">
          <Tabs
            items={WORKSPACE_TABS.map((tab) => ({ id: tab, label: TAB_LABELS[tab] }))}
            active={vibeTab}
            onSelect={setVibeTab}
            aria-label="Workspace view"
          />
          <div className="vibe-live-divider" />
          <Button
            variant="ghost"
            type="button"
            onClick={() => setVibePreviewKey((key) => key + 1)}
            title="Refresh preview"
            aria-label="Refresh preview"
          >
            <RotateCw size={15} />
          </Button>
          <a
            href={previewSrc}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!isPreviewAuthorized}
            onClick={(event) => {
              if (!isPreviewAuthorized) event.preventDefault();
            }}
            className="vibe-live-control"
          >
            <span>Preview</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <Button
            variant="primary"
            type="button"
            title="Publish to staging or production"
            disabled={workspaceMode === "plan"}
            onClick={() => setShowPublish(true)}
          >
            Publish
          </Button>
        </div>
      </header>
      <div className="vibe-live-body">
        <div className="vibe-live-chat-panel">
          <div className="vibe-live-thread" ref={threadRef} onScroll={handleThreadScroll}>
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
            {vibeMessages.map((message, messageIndex) =>
              message.role === "user" ? (
                <div key={message.id} className="vibe-message vibe-message-user">
                  {message.text}
                </div>
              ) : (
                <div key={message.id} className="vibe-message vibe-message-assistant">
                  {message.reasoning && (
                    <VibeReasoning
                      reasoning={message.reasoning}
                      // "Thinking" only while this is the active turn AND the answer has not started
                      // yet (no answer text, no actions) — once output begins, the model is done
                      // reasoning, so it relabels to "Thought process" and collapses.
                      live={
                        isVibing &&
                        messageIndex === vibeMessages.length - 1 &&
                        !message.text &&
                        message.actions.length === 0
                      }
                    />
                  )}
                  <div className="vibe-message-text">
                    {message.text ? (
                      <VibeMarkdown text={stripSuggestions(message.text)} />
                    ) : isVibing && !message.reasoning ? (
                      "▋"
                    ) : (
                      ""
                    )}
                  </div>
                  {message.actions.length > 0 && (
                    <div className="vibe-message-actions">
                      {message.actions.map((action, actionIndex) => (
                        <VibeActionRow
                          key={`${message.id}:${action.id}:${actionIndex}`}
                          action={action}
                        />
                      ))}
                    </div>
                  )}
                  {message.commitSha && (
                    <div className="vibe-commit-chip">
                      ⑂ committed {message.commitSha.slice(0, 8)}
                    </div>
                  )}
                  {message.isPlan && message.text && !isVibing && (
                    <Button
                      variant="primary"
                      type="button"
                      onClick={() => approveAndImplement(message.sourcePrompt ?? "", message.text)}
                    >
                      Approve &amp; implement
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
          <QuickMessages
            items={quickMessages}
            disabled={isVibing}
            onSubmit={(prompt) => {
              void handleVibeChat({ prompt, mode: workspaceMode });
            }}
          />
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
                    <Button
                      key={file.id}
                      variant={selected ? "primary" : "secondary"}
                      type="button"
                      onClick={() => toggleProjectFileAttachment(file.id)}
                      disabled={!ready}
                      title={ready ? "Attach to next prompt" : "File is not ready yet"}
                    >
                      <span>{file.fileName}</span>
                      <small>{ready ? "ready" : file.indexStatus}</small>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="vibe-live-composer-wrap">
            <div className="vibe-live-composer">
              <Textarea
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
                      <Button
                        key={value}
                        variant={workspaceMode === value ? "primary" : "secondary"}
                        type="button"
                        onClick={() => setWorkspaceMode(value)}
                        aria-pressed={workspaceMode === value}
                        title={description}
                      >
                        <Icon size={13} />
                        <span>{label}</span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => void handleVibeChat()}
                    disabled={isVibing || !promptDraft.trim()}
                    aria-label="Send prompt"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="vibe-live-preview-panel">
          {vibeTab === "preview" && isPreviewAuthorized ? (
            <iframe
              key={vibePreviewKey}
              title="Live preview"
              src={previewSrc}
              className="vibe-live-iframe"
            />
          ) : vibeTab === "preview" ? (
            <div className="hz-db-empty" role="status">
              {previewAuthorizationState === "loading"
                ? "Authorizing preview…"
                : "Preview authorization failed."}
              {previewAuthorizationState === "error" ? (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setPreviewAuthorizationAttempt((attempt) => attempt + 1)}
                >
                  Retry preview
                </Button>
              ) : null}
            </div>
          ) : vibeTab === "database" ? (
            <Suspense fallback={<div className="hz-db-empty">กำลังโหลด Database…</div>}>
              <WorkspaceDatabasePanel projectId={selectedProject.id} />
            </Suspense>
          ) : (
            <WorkspaceCodePanel projectId={selectedProject.id} />
          )}
        </div>
      </div>
      {showPublish ? (
        <PublishDialog projectId={selectedProject.id} onClose={() => setShowPublish(false)} />
      ) : null}
    </div>
  );
}
