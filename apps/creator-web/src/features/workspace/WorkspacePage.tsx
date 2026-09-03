import { ArrowUpRight, ChevronLeft, RotateCw, Send, Square } from "lucide-react";
import { Button, Tabs, Textarea } from "@evcp/ui";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { PublishDialog } from "@/features/publish";
import { PromptQueue } from "./PromptQueue";
import { BugReportBox } from "./BugReportBox";
import { QuickMessages } from "./QuickMessages";
import { WorkspaceHistoryPanel } from "./WorkspaceHistoryPanel";
import { VibeUserBubble } from "./VibeUserBubble";
import { VibeTurnTimeline } from "./VibeTurnTimeline";
import { VibeActionSummary } from "./VibeActionSummary";
import { WorkspaceCodePanel } from "./WorkspaceCodePanel";
import { WorkspaceAttachmentButton } from "./WorkspaceAttachmentButton";
import { ProjectFileStatus, WorkspaceRequestFailure } from "./WorkspaceFailureMessages";
import { buildQuickMessages } from "./quick-messages";
import { VibeQuestionBlock } from "./VibeQuestionBlock";
import { extractQuestions } from "./vibe-questions";
import { WorkspacePrdPanel } from "./WorkspacePrdPanel";
import { TAB_LABELS, WORKSPACE_TABS } from "./workspace-chrome";
import { turnLineTotal } from "./vibe-actions";
import { usePreviewGuards } from "./use-preview-guards";
import { VibePaneResizer, useChatPaneResize } from "./VibePaneResizer";
import { WorkspaceMobileNav, type WorkspaceView } from "./WorkspaceMobileNav";
import { VibeWorkingIndicator } from "./VibeWorkingIndicator";
import { usePreviewAuthorization } from "./use-preview-authorization";
import { currentWorkspaceTurnStart } from "./workspace-turn";
import { WorkspaceWakeOverlay } from "./WorkspaceWakeOverlay";
import type { useCreatorApp } from "@/app/use-creator-app";

// react-data-grid (and its CSS) is client-only; lazy-load it so importing WorkspacePage in
// Node test environments (render-smoke) never pulls in the CSS/grid module.
const WorkspaceDatabasePanel = lazy(() => import("./WorkspaceDatabasePanel"));

export function WorkspacePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    currentPrdVersion,
    isVibing,
    vibeStatus,
    vibeTechnicalDetails,
    vibeTab,
    setVibeTab,
    setVibePreviewKey,
    vibeMessages,
    promptDraft,
    setPromptDraft,
    cancelVibe,
    handleVibeChat,
    approveAndImplement,
    vibePreviewKey,
    projectFiles,
    selectedAttachmentIds,
    isUploadingProjectFile,
    projectFileMessage,
    projectFileTechnicalDetails,
    toggleProjectFileAttachment,
    handleUploadProjectFiles,
    hasPreview,
    promptQueue,
    removeQueuedPrompt,
    bugReports,
    addBugReport,
    dismissBugReport,
    reloadChatHistory
  } = app;
  const [showPublish, setShowPublish] = useState(false);
  const paneResize = useChatPaneResize();
  const [mobileView, setMobileView] = useState<WorkspaceView | null>("conversation");
  // Auto-scroll to the newest output, but never yank the user back down while they scroll up.
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
  // Preview is addressed by the id-derived resource key (matches the container name), not the
  // public slug, so it survives a rename. Project ids never contain hyphens.
  const previewSrc = `/preview/${selectedProject.id.replaceAll("_", "-")}`;
  const previewAuth = usePreviewAuthorization({
    projectId: selectedProject.id,
    previewKey: vibePreviewKey
  });
  const isPreviewAuthorized = previewAuth.isAuthorized;
  const liveLines = turnLineTotal(vibeMessages.at(-1)?.actions ?? []);
  const quickMessages = buildQuickMessages({
    project: selectedProject,
    prdSummary: currentPrdVersion?.changeSummary,
    prdSections: currentPrdVersion?.sections,
    messages: vibeMessages,
    hasPreview,
    hasProjectFiles: projectFiles.length > 0
  });
  usePreviewGuards({
    projectId: selectedProject.id,
    enabled: previewAuth.state === "ready",
    onBug: addBugReport
  });
  const selectTab = (tab: typeof vibeTab) => {
    setVibeTab(tab);
    setMobileView(tab === "prd" || tab === "history" ? null : tab);
  };
  const selectMobileView = (view: WorkspaceView) => {
    setMobileView(view);
    if (view !== "conversation") setVibeTab(view);
  };
  const currentTurnStart = currentWorkspaceTurnStart(vibeMessages);
  return (
    <div className="vibe-live-shell" aria-busy={app.isEnteringWorkspace || undefined}>
      {app.isEnteringWorkspace ? <WorkspaceWakeOverlay projectName={selectedProject.name} /> : null}
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
            {vibeStatus || "Completed"}
            {isVibing && liveLines > 0 ? ` · ${liveLines} lines` : ""}
          </span>
        </div>
        <div className="vibe-live-header-right">
          <div className="workspace-desktop-tabs">
            <Tabs
              items={WORKSPACE_TABS.map((tab) => ({ id: tab, label: TAB_LABELS[tab] }))}
              active={vibeTab}
              onSelect={selectTab}
              variant="segmented"
              aria-label="Workspace view"
            />
          </div>
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
            onClick={() => setShowPublish(true)}
          >
            Publish
          </Button>
        </div>
      </header>
      <WorkspaceMobileNav active={mobileView} onSelect={selectMobileView} />
      <div
        className={`vibe-live-body${paneResize.isChatCollapsed ? " is-chat-collapsed" : ""}`}
        data-workspace-view={mobileView ?? "supporting"}
        ref={paneResize.splitViewRef}
      >
        <div className="vibe-live-chat-panel">
          <div className="vibe-live-thread" ref={threadRef} onScroll={handleThreadScroll}>
            {vibeMessages.length === 0 && !isVibing && !vibeTechnicalDetails && (
              <div className="vibe-live-empty">
                <div className="vibe-live-empty-title">Create and understand your app with Pi</div>
                <p>
                  {
                    "Ask Pi about the app or describe a change. Files change only when your request asks for it."
                  }
                </p>
              </div>
            )}
            {vibeMessages.map((message, messageIndex) =>
              message.role === "user" ? (
                <VibeUserBubble
                  key={message.id}
                  text={message.text}
                  className={
                    messageIndex >= currentTurnStart ? "vibe-turn-current" : "vibe-turn-compact"
                  }
                />
              ) : (
                <div
                  key={message.id}
                  className={`vibe-message vibe-message-assistant ${
                    messageIndex >= currentTurnStart ? "vibe-turn-current" : "vibe-turn-compact"
                  }`}
                >
                  <VibeTurnTimeline
                    imageBase={previewSrc}
                    parts={message.parts}
                    legacy={message.parts?.length ? message : { ...message, actions: [] }}
                    live={isVibing && messageIndex === vibeMessages.length - 1}
                  />
                  {!message.parts?.length && <VibeActionSummary actions={message.actions} />}
                  {isVibing &&
                    messageIndex === vibeMessages.length - 1 &&
                    (message.text || !message.reasoning) &&
                    !message.parts?.length && (
                      <span className="vibe-cursor-blink" aria-hidden="true">
                        ▋
                      </span>
                    )}
                  {messageIndex === vibeMessages.length - 1 && !isVibing && (
                    <VibeQuestionBlock
                      questions={extractQuestions(message.text).questions}
                      disabled={isVibing}
                      onSubmit={(answer) => void handleVibeChat({ prompt: answer })}
                    />
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
            <WorkspaceRequestFailure technicalDetails={vibeTechnicalDetails} />
          </div>
          {/* Hidden mid-turn (stale); re-derives from the model's <suggest> lines when done. */}
          {!isVibing && quickMessages.length > 0 && (
            <QuickMessages
              items={quickMessages}
              disabled={isVibing}
              onSubmit={(prompt) => {
                void handleVibeChat({ prompt });
              }}
            />
          )}
          <div className="vibe-live-files">
            <ProjectFileStatus
              message={projectFileMessage}
              technicalDetails={projectFileTechnicalDetails}
            />
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
          <VibeWorkingIndicator active={isVibing} status={vibeStatus} />
          <BugReportBox
            bugs={bugReports}
            disabled={isVibing}
            onFix={setPromptDraft}
            onDismiss={dismissBugReport}
          />
          <PromptQueue items={promptQueue} onRemove={removeQueuedPrompt} />
          <div className="vibe-live-composer-wrap">
            <div className="vibe-live-composer">
              <Textarea
                className="vibe-composer-textarea"
                aria-label="Describe the change you want to make"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (promptDraft.trim()) void handleVibeChat();
                  }
                }}
                placeholder={
                  isVibing
                    ? "Keep typing — your request will be queued"
                    : "Ask Pi about the app or describe a change…"
                }
                rows={1}
              />
              <div className="vibe-composer-footer">
                <WorkspaceAttachmentButton
                  disabled={isUploadingProjectFile}
                  onFiles={(files) => void handleUploadProjectFiles(files)}
                />
                <div className="vibe-composer-shortcuts" aria-hidden="true">
                  {isVibing ? (
                    <span>Next prompt queues automatically</span>
                  ) : (
                    <>
                      <kbd>↵</kbd>
                      <span>send</span>
                      <span className="vibe-composer-shortcuts-divider">·</span>
                      <kbd>⇧↵</kbd>
                      <span>new line</span>
                    </>
                  )}
                </div>
                <div className="vibe-composer-right">
                  {isVibing ? (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={cancelVibe}
                      aria-label="Stop generation"
                      title="Stop generation"
                    >
                      <Square size={15} aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    className="vibe-composer-send"
                    variant="primary"
                    type="button"
                    onClick={() => void handleVibeChat()}
                    disabled={!promptDraft.trim()}
                    aria-label={isVibing ? "Queue prompt" : "Send prompt"}
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <VibePaneResizer resize={paneResize} />
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
              {previewAuth.state === "loading"
                ? "Authorizing preview…"
                : "Preview authorization failed."}
              {previewAuth.state === "error" ? (
                <Button variant="secondary" type="button" onClick={previewAuth.retry}>
                  Retry preview
                </Button>
              ) : null}
            </div>
          ) : vibeTab === "database" ? (
            <Suspense fallback={<div className="hz-db-empty">Loading database…</div>}>
              <WorkspaceDatabasePanel projectId={selectedProject.id} />
            </Suspense>
          ) : vibeTab === "prd" ? (
            <WorkspacePrdPanel app={app} />
          ) : vibeTab === "history" ? (
            <WorkspaceHistoryPanel
              projectId={selectedProject.id}
              messages={vibeMessages}
              disabled={isVibing}
              onRestored={() => {
                void reloadChatHistory();
                setVibePreviewKey((key) => key + 1);
              }}
            />
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
