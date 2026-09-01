import { useEffect, useRef, useState } from "react";

// Chat/preview split-pane sizing: persisted width, rAF drag-resize, collapse under a
// threshold. Extracted whole from WorkspacePage (boy-scout: the page sat over the 400-line
// ratchet and could not take further additions).

const CHAT_PANE_WIDTH_STORAGE_KEY = "evcp_creator_chat_pane_width";
export const DEFAULT_CHAT_PANE_WIDTH = 36;
export const MIN_CHAT_PANE_WIDTH = 28;
export const MAX_CHAT_PANE_WIDTH = 60;
const CHAT_PANE_COLLAPSE_THRESHOLD = 26;

export function clampChatPaneWidth(value: number): number {
  return Math.min(MAX_CHAT_PANE_WIDTH, Math.max(MIN_CHAT_PANE_WIDTH, value));
}

export function useChatPaneResize() {
  const [chatPaneWidth, setChatPaneWidth] = useState(DEFAULT_CHAT_PANE_WIDTH);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const splitViewRef = useRef<HTMLDivElement>(null);
  const chatPaneWidthRef = useRef(DEFAULT_CHAT_PANE_WIDTH);
  const isChatCollapsedRef = useRef(false);
  useEffect(() => {
    // getItem() null must not read as width 0 (= collapsed): main's parsing fix, ported.
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
  // Width reaches the DOM via this CSS variable (never an inline style prop — design-system
  // rule): initial load and keyboard resize land here; drag writes it imperatively per frame.
  useEffect(() => {
    splitViewRef.current?.style.setProperty("--vibe-chat-width", `${chatPaneWidth}%`);
  }, [chatPaneWidth]);
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
  return {
    chatPaneWidth,
    setChatPaneWidth,
    isResizingPanels,
    setIsResizingPanels,
    isChatCollapsed,
    setIsChatCollapsed,
    splitViewRef,
    chatPaneWidthRef,
    isChatCollapsedRef
  };
}

// The draggable/keyboard-operable separator between the chat and preview panes —
// extracted verbatim from WorkspacePage together with use-chat-pane-resize.
export function VibePaneResizer({ resize }: { resize: ReturnType<typeof useChatPaneResize> }) {
  const {
    chatPaneWidth,
    setChatPaneWidth,
    isResizingPanels,
    setIsResizingPanels,
    setIsChatCollapsed,
    splitViewRef,
    chatPaneWidthRef,
    isChatCollapsedRef
  } = resize;
  return (
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
  );
}
