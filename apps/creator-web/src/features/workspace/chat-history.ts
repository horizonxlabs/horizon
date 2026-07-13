import { apiBaseUrl } from "@/shared/routing";
import { vibeAuthHeaders } from "@/shared/session";
import type { VibeAction } from "./vibe-actions";
import type { VibeMessage } from "./vibe-stream";

export type ServerChatMessage = {
  id: string;
  role: string;
  content: string;
  actions?: Array<{ id: string; type: string; label: string; ok?: boolean }>;
  commitSha?: string | null;
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
