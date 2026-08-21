import { apiBaseUrl } from "@/shared/runtime-config";
import { vibeAuthHeaders } from "@/shared/session";
import type { WorkspaceChatTurnPart } from "@evcp/types";
import type { VibeAction } from "./vibe-actions";
import type { VibeMessage } from "./vibe-stream";

export type ServerChatMessage = {
  id: string;
  role: string;
  content: string;
  actions?: Array<{ id: string; type: string; label: string; ok?: boolean }>;
  parts?: WorkspaceChatTurnPart[];
  commitSha?: string | null;
};

export type ActiveChatTurn = {
  active: true;
  prompt: string;
  agentMode: string;
  events: Array<Record<string, unknown>>;
  parts?: WorkspaceChatTurnPart[];
};

// Pure transform: server chat rows -> the VibeMessage shape the workspace renders.
// Only user/assistant turns are surfaced; unknown action results default to "done".
export function mapChatHistoryToVibeMessages(messages: ServerChatMessage[]): VibeMessage[] {
  return messages
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
      parts: Array.isArray(message.parts) ? message.parts : undefined,
      commitSha: message.commitSha ?? undefined
    }));
}

// Fetches and maps a project's saved chat thread. Returns [] on any error/empty response so
// callers can treat "no history" and "failed to load" identically (show an empty thread).
export async function fetchChatHistory(projectId: string): Promise<VibeMessage[]> {
  const base = apiBaseUrl() ?? "/api";
  try {
    const res = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat/history`, {
      headers: vibeAuthHeaders()
    });
    if (!res.ok) return [];
    const data: { messages?: ServerChatMessage[] } | null = await res.json();
    const messages = data?.messages;
    if (!Array.isArray(messages)) return [];
    return mapChatHistoryToVibeMessages(messages);
  } catch {
    return [];
  }
}

// A browser refresh can happen while the server-owned Pi turn is still running. This endpoint
// returns its replay buffer so the UI can rebuild the live assistant bubble and keep polling.
export async function fetchActiveChatTurn(projectId: string): Promise<ActiveChatTurn | false | undefined> {
  const base = apiBaseUrl() ?? "/api";
  try {
    const res = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat/active`, {
      headers: vibeAuthHeaders()
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      active?: unknown;
      prompt?: unknown;
      agentMode?: unknown;
      events?: unknown;
      parts?: unknown;
    };
    if (data.active !== true) return false;
    return {
      active: true,
      prompt: String(data.prompt ?? ""),
      agentMode: String(data.agentMode ?? "auto"),
      events: Array.isArray(data.events)
        ? data.events.filter(
            (event): event is Record<string, unknown> => Boolean(event && typeof event === "object")
          )
        : [],
      parts: Array.isArray(data.parts) ? (data.parts as WorkspaceChatTurnPart[]) : undefined
    };
  } catch {
    return undefined;
  }
}

export async function cancelActiveChatTurn(projectId: string): Promise<void> {
  const base = apiBaseUrl() ?? "/api";
  await fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat/cancel`, {
    method: "POST",
    headers: vibeAuthHeaders()
  });
}
