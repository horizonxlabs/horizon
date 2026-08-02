import { type WorkspaceAgentMode } from "@evcp/api-client";
import { useEffect, useState } from "react";
import { fetchChatHistory } from "./chat-history";
import { vibeActionVerb } from "./vibe-actions";
import { ensureVibeWorkspace, streamVibeChat } from "./api";
import { applyVibeEvent, buildApproveTurn, type VibeMessage } from "./vibe-stream";

type VibeChatOptions = {
  selectedProjectId: string;
  promptDraft: string;
  setPromptDraft: (prompt: string) => void;
  workspaceMode: WorkspaceAgentMode;
  selectedAttachmentIds: string[];
};

export function useVibeChat({
  selectedProjectId,
  promptDraft,
  setPromptDraft,
  workspaceMode,
  selectedAttachmentIds
}: VibeChatOptions) {
  const [vibeMessages, setVibeMessages] = useState<VibeMessage[]>([]);
  const [vibeStatus, setVibeStatus] = useState("");
  const [isVibing, setIsVibing] = useState(false);
  const [vibePreviewKey, setVibePreviewKey] = useState(0);

  useEffect(() => {
    setVibeMessages([]);
    setVibeStatus("");
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
    const mode = overrides?.mode ?? workspaceMode;
    if (!projectId || !prompt) return;
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
      { id: assistantId, role: "assistant", text: "", actions: [], isPlan: mode === "plan", sourcePrompt: prompt }
    ]);
    setPromptDraft("");
    setIsVibing(true);
    setVibeStatus(mode === "plan" ? "Planning…" : "Provisioning workspace…");
    const patchAssistant = (fn: (message: VibeMessage) => VibeMessage) =>
      setVibeMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? fn(message) : message))
      );
    try {
      if (mode === "build") await ensureVibeWorkspace(projectId);
      setVibeStatus(mode === "plan" ? "Plan mode: read-only" : "AI is working…");
      await streamVibeChat(projectId, prompt, attachmentIds, mode, (type, data) => {
        const field = (key: string): string =>
          data && typeof data === "object" && key in data
            ? String((data as Record<string, unknown>)[key])
            : typeof data === "string"
              ? data
              : "";
        patchAssistant((message) => applyVibeEvent(message, type, data as Record<string, unknown>));
        if (type === "action_start") {
          setVibeStatus(`${vibeActionVerb(field("actionType") || "file", "running")}…`);
        } else if (type === "commit") {
          setVibeStatus(`Committed ${field("sha").slice(0, 8)}`);
        } else if (type === "done") {
          setVibeStatus((previous) =>
            mode === "plan" ? "Plan ready" : previous.startsWith("Committed") ? previous : "Done"
          );
          if (mode === "build") setVibePreviewKey((key) => key + 1);
        }
      }, overrides?.approvedPlan);
    } catch (error) {
      patchAssistant((message) => ({
        ...message,
        text: message.text + `\n\n⚠️ ${(error as Error).message}`
      }));
      setVibeStatus(`Error: ${(error as Error).message}`);
    } finally {
      setIsVibing(false);
    }
  }

  function approveAndImplement(sourcePrompt: string, planText: string) {
    void handleVibeChat(buildApproveTurn(sourcePrompt, planText));
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
    handleVibeChat,
    approveAndImplement
  };
}
