import { ArrowUpRight, ChevronLeft, RotateCw, Send, Square } from "lucide-react";
import { Button, Tabs, Textarea } from "@evcp/ui";
import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from "react";
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
import { usePreviewAuthorization } from "./use-preview-authorization";
import { currentWorkspaceTurnStart } from "./workspace-turn";
import type { useCreatorApp } from "@/app/use-creator-app";

// react-data-grid (and its CSS) is client-only; lazy-load it so importing WorkspacePage in
// Node test environments (render-smoke) never pulls in the CSS/grid module.
const WorkspaceDatabasePanel = lazy(() => import("./WorkspaceDatabasePanel"));

const CHAT_PANE_WIDTH_STORAGE_KEY = "evcp_creator_chat_pane_width";
const DEFAULT_CHAT_PANE_WIDTH = 36;
const MIN_CHAT_PANE_WIDTH = 28;
const MAX_CHAT_PANE_WIDTH = 60;
const CHAT_PANE_COLLAPSE_THRESHOLD = 26;
export type WorkspaceView = "conversation" | "preview" | "code" | "database";
const MOBILE_VIEWS: WorkspaceView[] = ["conversation", "preview", "code", "database"];

function clampChatPaneWidth(value: number): number {
  return Math.min(MAX_CHAT_PANE_WIDTH, Math.max(MIN_CHAT_PANE_WIDTH, value));
}

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
  const [mobileView, setMobileView] = useState<WorkspaceView | null>("conversation");
  const [chatPaneWidth, setChatPaneWidth] = useState(DEFAULT_CHAT_PANE_WIDTH);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const splitViewRef = useRef<HTMLDivElement>(null);
  const chatPaneWidthRef = useRef(DEFAULT_CHAT_PANE_WIDTH);
  const isChatCollapsedRef = useRef(false);
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
  useEffect(() => {
    const savedValue = window.localStorage.getItem(CHAT_PANE_WIDTH_STORAGE_KEY);
    const savedWidth = savedValue === null ? Number.NaN : Number(savedValue);
    if (savedValue !== null && savedWidth === 0) {
      isChatCollapsedRef.current = true;
      setIsChatCollapsed(true);
    } else if (Number.isFinite(savedWidth)) {
      const width = clampChatPaneWidth(savedWidth);
      chatPaneWidthRef.current = width;
      setChatPaneWidth(width);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(
      CHAT_PANE_WIDTH_STORAGE_KEY,
      isChatCollapsed ? "0" : String(chatPaneWidth)
    );
  }, [chatPaneWidth, isChatCollapsed]);
  useEffect(() => {
    if (!isResizingPanels) return;
    let frame: number | undefined;
    let latestClientX = 0;
    const resizeFromPointer = (clientX: number) => {
      const splitView = splitViewRef.current;
      const bounds = splitView?.getBoundingClientRect();
      if (!splitView || !bounds?.width) return;
      const rawWidth = ((clientX - bounds.left) / bounds.width) * 100;
      const shouldCollapse = rawWidth <= CHAT_PANE_COLLAPSE_THRESHOLD;
      if (shouldCollapse) {
        isChatCollapsedRef.current = true;
        splitView.classList.add("is-chat-collapsed");
        return;
      }
      isChatCollapsedRef.current = false;
      splitView.classList.remove("is-chat-collapsed");
      const minWidth = Math.max(MIN_CHAT_PANE_WIDTH, (320 / bounds.width) * 100);
      const maxWidth = Math.max(
        minWidth,
        Math.min(MAX_CHAT_PANE_WIDTH, 100 - (400 / bounds.width) * 100)
      );
      const width = Math.min(maxWidth, Math.max(minWidth, rawWidth));
      chatPaneWidthRef.current = width;
      splitView.style.setProperty("--vibe-chat-width", `${width}%`);
    };
    const onPointerMove = (event: PointerEvent) => {
      latestClientX = event.clientX;
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        resizeFromPointer(latestClientX);
      });
    };
    const stopResizing = () => {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
        resizeFromPointer(latestClientX);
      }
      setChatPaneWidth(chatPaneWidthRef.current);
      setIsChatCollapsed(isChatCollapsedRef.current);
      setIsResizingPanels(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResizing, { once: true });
    window.addEventListener("pointercancel", stopResizing, { once: true });
    window.addEventListener("blur", stopResizing, { once: true });
    document.body.classList.add("vibe-is-resizing");
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
      document.body.classList.remove("vibe-is-resizing");
    };
  }, [isResizingPanels]);
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
      <nav className="workspace-mobile-switcher" aria-label="Workspace panels">
        {MOBILE_VIEWS.map((view) => (
          <Button
            key={view}
            variant="ghost"
            type="button"
            aria-pressed={mobileView === view}
            onClick={() => selectMobileView(view)}
          >
            {view[0].toUpperCase() + view.slice(1)}
          </Button>
        ))}
      </nav>
      <div
        className={`vibe-live-body${isChatCollapsed ? " is-chat-collapsed" : ""}`}
        data-workspace-view={mobileView ?? "supporting"}
        ref={splitViewRef}
        style={{ "--vibe-chat-width": `${chatPaneWidth}%` } as CSSProperties}
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
        <div
          className={`vibe-live-resizer${isResizingPanels ? " is-resizing" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and preview panels"
          aria-valuemin={MIN_CHAT_PANE_WIDTH}
          aria-valuemax={MAX_CHAT_PANE_WIDTH}
          aria-valuenow={Math.round(chatPaneWidth)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            if (isChatCollapsedRef.current) {
              isChatCollapsedRef.current = false;
              splitViewRef.current?.classList.remove("is-chat-collapsed");
              const restoredWidth = Math.max(MIN_CHAT_PANE_WIDTH, chatPaneWidthRef.current);
              chatPaneWidthRef.current = restoredWidth;
              splitViewRef.current?.style.setProperty("--vibe-chat-width", `${restoredWidth}%`);
              setIsChatCollapsed(false);
            }
            setIsResizingPanels(true);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setChatPaneWidth(chatPaneWidthRef.current);
            setIsChatCollapsed(isChatCollapsedRef.current);
            setIsResizingPanels(false);
          }}
          onPointerCancel={() => {
            setChatPaneWidth(chatPaneWidthRef.current);
            setIsChatCollapsed(isChatCollapsedRef.current);
            setIsResizingPanels(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setChatPaneWidth((width) => {
                const next = clampChatPaneWidth(width - 2);
                chatPaneWidthRef.current = next;
                return next;
              });
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              setChatPaneWidth((width) => {
                const next = clampChatPaneWidth(width + 2);
                chatPaneWidthRef.current = next;
                return next;
              });
            }
            if (event.key === "Home") {
              event.preventDefault();
              chatPaneWidthRef.current = DEFAULT_CHAT_PANE_WIDTH;
              setChatPaneWidth(DEFAULT_CHAT_PANE_WIDTH);
            }
          }}
        >
          <span className="vibe-live-resizer-grip" aria-hidden="true" />
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
