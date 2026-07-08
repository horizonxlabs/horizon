import {
  type PreviewVersionDto,
  type WorkspacePromptResultDto,
  type WorkspaceSnapshotResponse
} from "@evcp/api-client";
import { useEffect, useState } from "react";
import { fallbackPreview, fallbackTaskSteps, usageRows } from "../data/mock-data";
import { createCreatorPlatformClient } from "../lib/creator-client";
import { apiBaseUrl } from "../lib/routing";
import { vibeAuthHeaders } from "../lib/session";
import { vibeActionVerb, type VibeAction } from "../lib/vibe-actions";
import { applyVibeEvent, type VibeMessage } from "../lib/vibe-stream";
import type { CreatorProjectView } from "../types";
import { ensureVibeWorkspace, loadWorkspaceState, streamVibeChat } from "./creator-app-helpers";

export function useVibeWorkspace({ selectedProject }: { selectedProject: CreatorProjectView }) {
  const [promptDraft, setPromptDraft] = useState("Add WFH leave type");
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshotResponse | undefined>(
    undefined
  );
  const [workspaceResult, setWorkspaceResult] = useState<WorkspacePromptResultDto | undefined>(
    undefined
  );
  const [previewOverride, setPreviewOverride] = useState<PreviewVersionDto | undefined>(undefined);
  const [workspaceMessage, setWorkspaceMessage] = useState(
    "Using deterministic local workspace evidence until Platform API is configured."
  );
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [vibeMessages, setVibeMessages] = useState<VibeMessage[]>([]);
  const [vibeStatus, setVibeStatus] = useState("");
  const [isVibing, setIsVibing] = useState(false);
  const [vibePreviewKey, setVibePreviewKey] = useState(0);
  const [vibeTab, setVibeTab] = useState<"preview" | "code">("preview");
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);

  const selectedFallbackPreview: PreviewVersionDto = {
    ...fallbackPreview,
    projectId: selectedProject.id,
    screenTitle: selectedProject.name,
    summary: `${selectedProject.name} preview will appear after the first AI workspace prompt.`
  };
  const latestTask = workspaceResult?.task ?? workspaceSnapshot?.tasks.at(-1);
  const visibleTaskSteps = latestTask?.steps ?? fallbackTaskSteps;
  const visiblePreview =
    previewOverride ??
    workspaceResult?.preview ??
    workspaceSnapshot?.preview ??
    selectedFallbackPreview;
  const visibleHighlights = visiblePreview.highlights.length
    ? visiblePreview.highlights
    : selectedFallbackPreview.highlights;
  const visibleTokenBudget = workspaceResult?.tokenBudget ??
    workspaceSnapshot?.tokenBudget ?? {
      remainingToday: 880,
      remainingMonth: 4880,
      requestEstimate: 120
    };
  const visibleUsageRows = (
    workspaceSnapshot?.usage.length
      ? workspaceSnapshot.usage
      : workspaceResult?.usage
        ? [workspaceResult.usage]
        : []
  ).map((usage) => ({
    prompt: usage.prompt,
    scenario: usage.scenario,
    tokens: String(usage.tokensUsed),
    result: visiblePreview.version
  }));
  const visibleUsage = visibleUsageRows.length ? visibleUsageRows : usageRows;

  function resetWorkspace() {
    setWorkspaceSnapshot(undefined);
    setWorkspaceResult(undefined);
    setPreviewOverride(undefined);
  }

  // Restore the chat thread from the server so a browser refresh doesn't lose history.
  useEffect(() => {
    const pid = selectedProject?.id;
    if (!pid) return;
    const base = apiBaseUrl() ?? "/api";
    fetch(`${base}/projects/${encodeURIComponent(pid)}/chat/history`, {
      headers: vibeAuthHeaders()
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            messages?: Array<{
              id: string;
              role: string;
              content: string;
              actions?: Array<{ id: string; type: string; label: string; ok?: boolean }>;
              commitSha?: string | null;
            }>;
          } | null
        ) => {
          const messages = data?.messages;
          if (!Array.isArray(messages) || messages.length === 0) return;
          setVibeMessages(
            messages
              .filter((message) => message.role === "user" || message.role === "assistant")
              .map((message) => ({
                id: message.id,
                role: message.role === "user" ? "user" : "assistant",
                text: message.content,
                actions: Array.isArray(message.actions)
                  ? message.actions.map((a) => ({
                      id: a.id,
                      type: a.type,
                      label: a.label,
                      status: (a.ok === false ? "failed" : "done") as VibeAction["status"]
                    }))
                  : [],
                commitSha: message.commitSha ?? undefined
              }))
          );
        }
      )
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  function fallbackWorkspacePromptResult(): WorkspacePromptResultDto {
    const now = new Date().toISOString();
    return {
      guardrail: { decision: "allow", eventId: "local_guardrail_0001" },
      task: {
        id: "local_workspace_task_0001",
        projectId: selectedProject.id,
        prompt: promptDraft,
        status: "ready",
        guardrailDecision: "allow",
        guardrailEventId: "local_guardrail_0001",
        steps: fallbackTaskSteps,
        createdByUserId: "local_creator",
        createdAt: now
      },
      preview: {
        ...selectedFallbackPreview,
        projectId: selectedProject.id,
        summary: `Local preview updated: ${promptDraft}`,
        createdAt: now
      },
      usage: {
        id: "local_usage_0001",
        projectId: selectedProject.id,
        taskId: "local_workspace_task_0001",
        actorId: "local_creator",
        scenario: "frontend_coding",
        providerId: "local_fallback",
        model: "deterministic-preview",
        prompt: promptDraft,
        tokensUsed: 120,
        occurredAt: now,
        status: "succeeded"
      },
      tokenBudget: { remainingToday: 880, remainingMonth: 4880, requestEstimate: 120 }
    };
  }

  async function handleVibeChat() {
    if (!selectedProject || !promptDraft.trim()) return;
    const prompt = promptDraft.trim();
    const assistantId = `a-${Date.now()}`;
    setVibeMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: prompt, actions: [] },
      { id: assistantId, role: "assistant", text: "", actions: [] }
    ]);
    setPromptDraft("");
    setIsVibing(true);
    setVibeStatus("Provisioning workspace…");
    const patchAssistant = (fn: (m: VibeMessage) => VibeMessage) =>
      setVibeMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));
    try {
      await ensureVibeWorkspace(selectedProject.id, selectedProject.slug);
      setVibeStatus("AI is working…");
      await streamVibeChat(selectedProject.id, prompt, (type, data) => {
        const field = (key: string): string =>
          data && typeof data === "object" && key in data
            ? String((data as Record<string, unknown>)[key])
            : typeof data === "string"
              ? data
              : "";
        patchAssistant((m) => applyVibeEvent(m, type, data as Record<string, unknown>));
        if (type === "action_start") {
          setVibeStatus(`${vibeActionVerb(field("actionType") || "file", "running")}…`);
        } else if (type === "commit") {
          const sha = field("sha");
          setVibeStatus(`Committed ${sha.slice(0, 8)}`);
          setVibePreviewKey((k) => k + 1);
        } else if (type === "done") {
          setVibeStatus((prev) => (prev.startsWith("Committed") ? prev : "Done"));
        }
      });
    } catch (error) {
      patchAssistant((m) => ({ ...m, text: m.text + `\n\n⚠️ ${(error as Error).message}` }));
      setVibeStatus(`Error: ${(error as Error).message}`);
    } finally {
      setIsVibing(false);
    }
  }

  async function handleSubmitPrompt() {
    setIsSubmittingPrompt(true);
    try {
      const result = await createCreatorPlatformClient().submitWorkspacePrompt(selectedProject.id, {
        prompt: promptDraft
      });
      setWorkspaceResult(result);
      setPreviewOverride(undefined);
      setWorkspaceSnapshot(await loadWorkspaceState(selectedProject.id));
      setWorkspaceMessage(
        result.guardrail.decision === "block"
          ? "Prompt blocked by guardrail. Existing preview was preserved."
          : "Prompt accepted. Workspace preview and token evidence updated from Platform API."
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("not configured")) {
        const result = fallbackWorkspacePromptResult();
        setWorkspaceResult(result);
        setPreviewOverride(undefined);
        setWorkspaceMessage(
          "Local fallback generated deterministic workspace evidence. Configure Platform API to persist it."
        );
      } else {
        setWorkspaceMessage(
          "Prompt failed. Existing preview was preserved; check Platform API logs for details."
        );
      }
    } finally {
      setIsSubmittingPrompt(false);
    }
  }

  async function handleRefreshPreview() {
    setIsRefreshingPreview(true);
    try {
      const preview = await createCreatorPlatformClient().refreshWorkspacePreview(
        selectedProject.id
      );
      setPreviewOverride(preview);
      setWorkspaceMessage("Preview refreshed from Platform API.");
    } catch (error) {
      if (error instanceof Error && error.message.includes("not configured")) {
        setPreviewOverride(visiblePreview);
        setWorkspaceMessage("Local fallback preview refreshed deterministically.");
      } else {
        setWorkspaceMessage("Preview refresh failed. Existing preview remains visible.");
      }
    } finally {
      setIsRefreshingPreview(false);
    }
  }

  return {
    promptDraft,
    setPromptDraft,
    workspaceSnapshot,
    setWorkspaceSnapshot,
    workspaceResult,
    setWorkspaceResult,
    previewOverride,
    setPreviewOverride,
    workspaceMessage,
    setWorkspaceMessage,
    isSubmittingPrompt,
    setIsSubmittingPrompt,
    vibeMessages,
    setVibeMessages,
    vibeStatus,
    setVibeStatus,
    isVibing,
    setIsVibing,
    vibePreviewKey,
    setVibePreviewKey,
    vibeTab,
    setVibeTab,
    isRefreshingPreview,
    setIsRefreshingPreview,
    selectedFallbackPreview,
    latestTask,
    visibleTaskSteps,
    visiblePreview,
    visibleHighlights,
    visibleTokenBudget,
    visibleUsageRows,
    visibleUsage,
    resetWorkspace,
    handleVibeChat,
    handleSubmitPrompt,
    handleRefreshPreview
  };
}
