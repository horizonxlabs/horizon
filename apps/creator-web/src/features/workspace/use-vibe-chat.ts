import { type WorkspaceAgentMode } from "@evcp/api-client";
import { useEffect, useRef, useState } from "react";
import { fetchChatHistory } from "./chat-history";
import { ensureVibeWorkspace, streamVibeChat } from "./api";
import { enqueuePrompt, removeQueued, takeNext, type QueuedPrompt } from "./vibe-queue";
import { mergeBugReports, type BugReport } from "./vibe-bugs";
import { extractQuestions } from "./vibe-questions";
import { applyVibeEvent, buildApproveTurn, type VibeMessage } from "./vibe-stream";

type VibeChatOptions = {
  selectedProjectId: string;
  promptDraft: string;
  setPromptDraft: (prompt: string) => void;
  selectedAttachmentIds: string[];
};

export type WorkspaceOutcome = "Working" | "Waiting for input" | "Completed" | "Stopped" | "Failed";

export function workspaceOutcomeForEvent({
  type,
  current,
  assistantText
}: {
  type: "start" | "action_start" | "commit" | "error" | "done" | "cancelled";
  current: WorkspaceOutcome | "";
  assistantText: string;
}): WorkspaceOutcome {
  if (type === "cancelled") return "Stopped";
  if (type === "error" || (type === "done" && current === "Failed")) return "Failed";
  if (type === "done") {
    return extractQuestions(assistantText).questions.length > 0 ? "Waiting for input" : "Completed";
  }
  return "Working";
}

export function useVibeChat({
  selectedProjectId,
  promptDraft,
  setPromptDraft,
  selectedAttachmentIds
}: VibeChatOptions) {
  const [vibeMessages, setVibeMessages] = useState<VibeMessage[]>([]);
  const [vibeStatus, setVibeStatus] = useState("");
  const [isVibing, setIsVibing] = useState(false);
  const [vibePreviewKey, setVibePreviewKey] = useState(0);
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const activeStreamAbort = useRef<AbortController | undefined>(undefined);
  // Refs so the busy-check and the drain effect never act on stale closures.
  const isVibingRef = useRef(false);
  isVibingRef.current = isVibing;

  useEffect(() => {
    activeStreamAbort.current?.abort();
    activeStreamAbort.current = undefined;
    setIsVibing(false);
    setVibeMessages([]);
    setVibeStatus("");
    setPromptQueue([]);
    setBugReports([]);
    if (!selectedProjectId) return;
    let ignore = false;
    fetchChatHistory(selectedProjectId).then((restored) => {
      if (ignore || restored.length === 0) return;
      setVibeMessages(restored);
    });
    return () => {
      ignore = true;
    };
  }, [selectedProjectId]);

  async function handleVibeChat(overrides?: {
    prompt?: string;
    projectId?: string;
    mode?: WorkspaceAgentMode;
    approvedPlan?: string;
  }) {
    const projectId = overrides?.projectId ?? selectedProjectId;
    const prompt = (overrides?.prompt ?? promptDraft).trim();
    const mode = overrides?.mode ?? "auto";
    if (!projectId || !prompt) return;
    // Busy = the request waits its turn in the queue instead of being rejected. It becomes a
    // real chat message only when the drain effect picks it up. (Approve-plan turns carry
    // approvedPlan and are never queued — they only fire when no turn is running.)
    if (isVibingRef.current && !overrides?.approvedPlan) {
      setPromptQueue((queue) => enqueuePrompt(queue, { prompt, mode }));
      setPromptDraft("");
      return;
    }
    const attachmentIds = overrides?.projectId ? [] : [...selectedAttachmentIds];
    const assistantId = `a-${Date.now()}`;
    setVibeMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: attachmentIds.length ? `${prompt}\nAttached files: ${attachmentIds.length}` : prompt,
        actions: []
      },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        actions: [],
        isPlan: mode === "plan",
        sourcePrompt: prompt
      }
    ]);
    setPromptDraft("");
    setIsVibing(true);
    let assistantText = "";
    let outcomeStatus: WorkspaceOutcome = workspaceOutcomeForEvent({
      type: "start",
      current: "",
      assistantText
    });
    setVibeStatus(outcomeStatus);
    const patchAssistant = (fn: (message: VibeMessage) => VibeMessage) =>
      setVibeMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? fn(message) : message))
      );
    const streamController = new AbortController();
    activeStreamAbort.current?.abort();
    activeStreamAbort.current = streamController;
    try {
      if (mode !== "plan") await ensureVibeWorkspace(projectId, streamController.signal);
      await streamVibeChat(
        projectId,
        prompt,
        attachmentIds,
        mode,
        (type, data) => {
          const field = (key: string): string =>
            data && typeof data === "object" && key in data
              ? String((data as Record<string, unknown>)[key])
              : typeof data === "string"
                ? data
                : "";
          if (type === "token") assistantText += field("content");
          if (type === "bug_report") {
            const bugs = Array.isArray((data as { bugs?: unknown })?.bugs)
              ? (data as { bugs: BugReport[] }).bugs
              : [];
            // Post-turn scans REPLACE the box: fixed bugs disappear, open ones stay visible.
            setBugReports(bugs);
            return;
          }
          patchAssistant((message) =>
            applyVibeEvent(message, type, data as Record<string, unknown>)
          );
          if (type === "action_start") {
            outcomeStatus = workspaceOutcomeForEvent({ type, current: outcomeStatus, assistantText });
            setVibeStatus(outcomeStatus);
          } else if (type === "commit") {
            outcomeStatus = workspaceOutcomeForEvent({ type, current: outcomeStatus, assistantText });
            setVibeStatus(outcomeStatus);
            setVibePreviewKey((key) => key + 1);
          } else if (type === "error") {
            outcomeStatus = workspaceOutcomeForEvent({ type, current: outcomeStatus, assistantText });
            setVibeStatus(outcomeStatus);
          } else if (type === "done") {
            outcomeStatus = workspaceOutcomeForEvent({ type, current: outcomeStatus, assistantText });
            setVibeStatus(outcomeStatus);
          }
        },
        overrides?.approvedPlan,
        streamController.signal
      );
    } catch (error) {
      const cancelled = streamController.signal.aborted;
      if (!cancelled) {
        patchAssistant((message) => ({
          ...message,
          text: message.text + `\n\n⚠️ ${(error as Error).message}`
        }));
      }
      if (activeStreamAbort.current === streamController) {
        outcomeStatus = workspaceOutcomeForEvent({
          type: cancelled ? "cancelled" : "error",
          current: outcomeStatus,
          assistantText
        });
        setVibeStatus(outcomeStatus);
      }
    } finally {
      if (activeStreamAbort.current === streamController) {
        activeStreamAbort.current = undefined;
        setIsVibing(false);
      }
    }
  }

  function cancelVibe() {
    if (!activeStreamAbort.current) return;
    setVibeStatus("Stopped");
    activeStreamAbort.current.abort();
  }

  // Drain the queue one item per finished turn: when the AI goes idle and work is waiting,
  // the head becomes the next chat turn (its removal from the queue = the ✓ the user sees).
  useEffect(() => {
    if (isVibing || promptQueue.length === 0) return;
    const { next, rest } = takeNext(promptQueue);
    if (!next) return;
    setPromptQueue(rest);
    void handleVibeChat({ prompt: next.prompt, mode: next.mode });
    // handleVibeChat is stable enough here: it reads current state through refs/args.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVibing, promptQueue]);

  function removeQueuedPrompt(id: string) {
    setPromptQueue((queue) => removeQueued(queue, id));
  }

  function approveAndImplement(sourcePrompt: string, planText: string) {
    void handleVibeChat(buildApproveTurn(sourcePrompt, planText));
  }

  // Re-pull persisted history (used after a code rollback appends its note server-side).
  async function reloadChatHistory() {
    if (!selectedProjectId) return;
    const restored = await fetchChatHistory(selectedProjectId).catch(() => []);
    if (restored.length > 0) setVibeMessages(restored);
  }

  return {
    vibeMessages,
    setVibeMessages,
    vibeStatus,
    setVibeStatus,
    isVibing,
    setIsVibing,
    vibePreviewKey,
    setVibePreviewKey,
    promptQueue,
    removeQueuedPrompt,
    bugReports,
    addBugReport: (bug: BugReport) => setBugReports((current) => mergeBugReports(current, [bug])),
    dismissBugReport: (signature: string) =>
      setBugReports((current) => current.filter((bug) => bug.signature !== signature)),
    cancelVibe,
    handleVibeChat,
    approveAndImplement,
    reloadChatHistory
  };
}
