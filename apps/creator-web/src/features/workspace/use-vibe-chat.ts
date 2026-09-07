import { type WorkspaceAgentMode } from "@evcp/api-client";
import { useEffect, useRef, useState } from "react";
import {
  cancelActiveChatTurn,
  fetchActiveChatTurn,
  fetchChatHistory,
  type ActiveChatTurn
} from "./chat-history";
import { ensureVibeWorkspace, streamVibeChat } from "./api";
import { enqueuePrompt, removeQueued, takeNext, type QueuedPrompt } from "./vibe-queue";
import { mergeBugReports, type BugReport } from "./vibe-bugs";
import { extractQuestions } from "./vibe-questions";
import { applyVibeEvent, buildApproveTurn, type VibeMessage } from "./vibe-stream";
import { latestUserMessageIndex } from "./workspace-turn";

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

export function workspaceOutcomeForHistory(messages: VibeMessage[]): WorkspaceOutcome | "" {
  const latestUserIndex = latestUserMessageIndex(messages);
  const latestTurn = messages.slice(latestUserIndex >= 0 ? latestUserIndex : -1);
  const latest = latestTurn.at(-1);
  if (!latest) return "";
  if (latest.role === "user") return "Working";
  // A committed candidate can still have a finalization error; keep explicit turn failures.
  if (latest.parts?.some((part) => part.type === "error") || /(?:^|\n)⚠️/.test(latest.text)) {
    return "Failed";
  }
  if (extractQuestions(latest.text).questions.length > 0) return "Waiting for input";
  // Validation and checkpointing supersede recovered tool attempts, not their history.
  if (latest.commitSha) return "Completed";
  if (latest.actions.some((action) => action.status === "failed")) return "Failed";
  if (latest.actions.some((action) => action.status === "running")) return "Working";
  return "Completed";
}

export function useVibeChat({
  selectedProjectId,
  promptDraft,
  setPromptDraft,
  selectedAttachmentIds
}: VibeChatOptions) {
  const [vibeMessages, setVibeMessages] = useState<VibeMessage[]>([]);
  const [vibeStatus, setVibeStatus] = useState("");
  const [vibeTechnicalDetails, setVibeTechnicalDetails] = useState<string | undefined>();
  const [isVibing, setIsVibing] = useState(false);
  const [vibePreviewKey, setVibePreviewKey] = useState(0);
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const activeStreamAbort = useRef<AbortController | undefined>(undefined);
  const historyRevisionRef = useRef(0);
  // Refs so the busy-check and the drain effect never act on stale closures.
  const isVibingRef = useRef(false);
  isVibingRef.current = isVibing;

  useEffect(() => {
    activeStreamAbort.current?.abort();
    activeStreamAbort.current = undefined;
    setIsVibing(false);
    setVibeMessages([]);
    setVibeStatus("");
    setVibeTechnicalDetails(undefined);
    setPromptQueue([]);
    setBugReports([]);
    if (!selectedProjectId) return;
    const revision = ++historyRevisionRef.current;
    let ignore = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const activeMessageId = `active-${selectedProjectId}`;
    const renderActiveTurn = (restored: VibeMessage[], active: ActiveChatTurn) => {
      const replayed = active.events.reduce<VibeMessage>(
        (message, event) => applyVibeEvent(message, String(event.type ?? ""), event),
        {
          id: activeMessageId,
          role: "assistant",
          text: "",
          actions: [],
          isPlan: active.agentMode === "plan",
          sourcePrompt: active.prompt
        }
      );
      // The server-normalized snapshot retains the original event ordering and safe summaries.
      // Events remain only as a compatibility replay fallback during rolling deployments.
      const liveMessage = active.parts?.length ? { ...replayed, parts: active.parts } : replayed;
      const withoutPriorLive = restored.filter((message) => message.id !== activeMessageId);
      return [...withoutPriorLive, liveMessage];
    };
    const reconcile = async (initial = false) => {
      const active = await fetchActiveChatTurn(selectedProjectId);
      if (ignore || active === undefined) return;
      if (active) {
        setVibeMessages((current) => renderActiveTurn(current, active));
        setIsVibing(true);
        setVibeStatus("Working");
        return;
      }
      if (!initial) {
        const restored = await fetchChatHistory(selectedProjectId);
        if (!ignore && restored.length > 0) setVibeMessages(restored);
        if (!ignore) {
          setIsVibing(false);
          setVibeStatus(workspaceOutcomeForHistory(restored));
        }
      }
    };
    void Promise.all([
      fetchChatHistory(selectedProjectId),
      fetchActiveChatTurn(selectedProjectId)
    ]).then(([restored, active]) => {
      if (ignore || revision !== historyRevisionRef.current) return;
      if (restored.length > 0) {
        setVibeMessages(restored);
        setVibeStatus(workspaceOutcomeForHistory(restored));
      }
      if (active) {
        setVibeMessages(renderActiveTurn(restored, active));
        setIsVibing(true);
        setVibeStatus("Working");
        poll = setInterval(() => void reconcile(), 1500);
      }
    });
    return () => {
      ignore = true;
      if (poll) clearInterval(poll);
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
    historyRevisionRef.current += 1;
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
    setVibeTechnicalDetails(undefined);
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
            outcomeStatus = workspaceOutcomeForEvent({
              type,
              current: outcomeStatus,
              assistantText
            });
            setVibeStatus(outcomeStatus);
          } else if (type === "commit") {
            outcomeStatus = workspaceOutcomeForEvent({
              type,
              current: outcomeStatus,
              assistantText
            });
            setVibeStatus(outcomeStatus);
            setVibePreviewKey((key) => key + 1);
          } else if (type === "error") {
            outcomeStatus = workspaceOutcomeForEvent({
              type,
              current: outcomeStatus,
              assistantText
            });
            setVibeStatus(outcomeStatus);
          } else if (type === "done") {
            outcomeStatus = workspaceOutcomeForEvent({
              type,
              current: outcomeStatus,
              assistantText
            });
            setVibeStatus(outcomeStatus);
          }
        },
        overrides?.approvedPlan,
        streamController.signal
      );
    } catch (error) {
      const cancelled = streamController.signal.aborted;
      if (!cancelled) {
        setVibeTechnicalDetails(
          error instanceof Error ? error.message : "Unknown workspace request failure."
        );
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
    setVibeStatus("Stopping…");
    activeStreamAbort.current?.abort();
    if (selectedProjectId) void cancelActiveChatTurn(selectedProjectId);
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
    const revision = ++historyRevisionRef.current;
    const restored = await fetchChatHistory(selectedProjectId).catch(() => []);
    if (revision === historyRevisionRef.current && restored.length > 0) {
      setVibeMessages(restored);
      setVibeStatus(workspaceOutcomeForHistory(restored));
    }
  }

  return {
    vibeMessages,
    setVibeMessages,
    vibeStatus,
    setVibeStatus,
    vibeTechnicalDetails,
    setVibeTechnicalDetails,
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
