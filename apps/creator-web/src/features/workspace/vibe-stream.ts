import type { WorkspaceChatToolPart, WorkspaceChatTurnPart } from "@evcp/types";
import type { VibeAction } from "./vibe-actions";

export type VibeMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: VibeAction[];
  // Ordered, display-safe Pi events. This is the source of truth for a current turn and for
  // restored history; the fields above remain for old chat rows and surrounding legacy UI.
  parts?: WorkspaceChatTurnPart[];
  // Streamed chain-of-thought (reasoning models). Shown as a separate, collapsible "thinking"
  // block — never mixed into `text` or parsed as actions.
  reasoning?: string;
  commitSha?: string;
  // Set on a plan-mode assistant message so the UI can offer "Approve & implement"; sourcePrompt is
  // the original request that produced the plan, re-sent (in build mode) when the Creator approves.
  isPlan?: boolean;
  sourcePrompt?: string;
};

// The build turn produced when a Creator approves a plan-mode plan: re-send the original request in
// build mode, carrying the approved plan text so the AI implements exactly it.
export function buildApproveTurn(sourcePrompt: string, planText: string): {
  prompt: string;
  mode: "build";
  approvedPlan: string;
} {
  return { prompt: sourcePrompt, mode: "build", approvedPlan: planText };
}

// Applies one SSE frame (token | action_start | action_chunk | action_result | commit | error) to an
// assistant message. Pure state transition, extracted from the inline handling that used
// to live inside CreatorApp's handleVibeChat so it can be unit tested in isolation. Must
// stay byte-identical in behavior to that inline logic.
export function applyVibeEvent(
  message: VibeMessage,
  type: string,
  data: Record<string, unknown>
): VibeMessage {
  const field = (key: string): string =>
    data && typeof data === "object" && key in data
      ? String((data as Record<string, unknown>)[key])
      : typeof data === "string"
        ? data
        : "";

  const appendPart = (
    type: "reasoning" | "text",
    text: string
  ): WorkspaceChatTurnPart[] => {
    const parts = message.parts ?? [];
    const last = parts.at(-1);
    if (last?.type === type) {
      return [...parts.slice(0, -1), { ...last, text: last.text + text }];
    }
    return [...parts, { id: `live-${type}-${parts.length}`, type, sequence: parts.length, text }];
  };
  const appendOrUpdateToolPart = (
    actionId: string,
    patch: Partial<WorkspaceChatToolPart>
  ): WorkspaceChatTurnPart[] => {
    const parts = message.parts ?? [];
    const index = parts.findIndex((part) => part.type === "tool" && part.tool.callId === actionId);
    const current = index >= 0 ? parts[index] : undefined;
    const tool = {
      actionType: field("actionType") || "file",
      label: field("label"),
      callId: actionId,
      inputSummary: field("inputSummary") || "Tool requested",
      ...((current?.type === "tool" ? current.tool : {})),
      ...patch
    } as WorkspaceChatToolPart;
    const part: WorkspaceChatTurnPart = {
      id: current?.id ?? `live-tool-${actionId}`,
      type: "tool",
      sequence: current?.sequence ?? parts.length,
      tool
    };
    return index >= 0 ? parts.map((item, itemIndex) => (itemIndex === index ? part : item)) : [...parts, part];
  };

  if (type === "token") {
    const content = field("content");
    return { ...message, text: message.text + content, parts: appendPart("text", content) };
  }

  if (type === "reasoning") {
    const content = field("content");
    return {
      ...message,
      reasoning: (message.reasoning ?? "") + content,
      parts: appendPart("reasoning", content)
    };
  }

  if (type === "action_start") {
    const id = field("actionId");
    return {
      ...message,
      actions: message.actions.some((a) => a.id === id)
        ? message.actions
        : [
            ...message.actions,
            {
              id,
              type: field("actionType") || "file",
              label: field("label"),
              status: "running" as const
            }
          ],
      parts: appendOrUpdateToolPart(id, { status: "running", startedAt: new Date().toISOString() })
    };
  }

  if (type === "action_chunk") {
    const id = field("actionId");
    const content = field("content");
    return {
      ...message,
      actions: message.actions.map((a) =>
        a.id === id ? { ...a, body: (a.body ?? "") + content } : a
      ),
      parts: appendOrUpdateToolPart(id, { status: "running", progress: content })
    };
  }

  if (type === "action_result") {
    const ok =
      data && typeof data === "object" && "ok" in data
        ? Boolean((data as { ok: boolean }).ok)
        : false;
    const id = field("actionId");
    const patch = {
      type: field("actionType") || "file",
      label: field("label"),
      status: (ok ? "done" : "failed") as VibeAction["status"],
      find: field("find") || undefined,
      replace: field("replace") || undefined,
      body: field("body") || undefined,
      error: field("error") || undefined
    };
    return {
      ...message,
      actions: message.actions.some((a) => a.id === id)
        ? message.actions.map((a) => (a.id === id ? { ...a, ...patch } : a))
        : [...message.actions, { id, ...patch }],
      parts: appendOrUpdateToolPart(id, {
        status: ok ? "done" : "failed",
        result: ok ? field("body") || undefined : undefined,
        error: ok ? undefined : field("error") || field("body") || "Tool failed",
        endedAt: new Date().toISOString()
      })
    };
  }

  if (type === "commit") {
    const parts = message.parts ?? [];
    return {
      ...message,
      commitSha: field("sha"),
      parts: [...parts, { id: `live-commit-${parts.length}`, type: "commit", sequence: parts.length, sha: field("sha") }]
    };
  }

  if (type === "error") {
    const error = field("message");
    const parts = message.parts ?? [];
    return {
      ...message,
      text: message.text + `\n\n⚠️ ${error}`,
      parts: [...parts, { id: `live-error-${parts.length}`, type: "error", sequence: parts.length, message: error }]
    };
  }

  return message;
}
