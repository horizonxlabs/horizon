import type { WorkspaceChatMessage } from "@evcp/types";

import type { ChatHistoryStore } from "./chat-history-store";

const DEFAULT_RECENT_MESSAGES = 10;
const DEFAULT_SUMMARY_CHARS = 8_000;
const MAX_MESSAGE_SUMMARY_CHARS = 600;

export function selectRecentPiHistory(
  messages: WorkspaceChatMessage[],
  currentMessageId?: string,
  maxMessages = DEFAULT_RECENT_MESSAGES
): WorkspaceChatMessage[] {
  const eligible = messages.filter(
    (message) => message.id !== currentMessageId && message.role !== "system"
  );
  const recent = eligible.slice(-Math.max(0, maxMessages));
  const firstUserIndex = recent.findIndex((message) => message.role === "user");
  return firstUserIndex < 0 ? [] : recent.slice(firstUserIndex);
}

export function buildRollingSummary(
  messages: WorkspaceChatMessage[],
  maxChars = DEFAULT_SUMMARY_CHARS
): string {
  const lines = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => summarizeMessage(message));
  const limit = Math.max(0, maxChars);

  while (lines.length > 1 && lines.join("\n").length > limit) lines.shift();
  const summary = lines.join("\n");
  return summary.length <= limit ? summary : summary.slice(-limit);
}

export async function refreshRollingSummary(
  store: Pick<ChatHistoryStore, "listRecentMessages" | "putSummary">,
  projectId: string,
  options: { maxChars?: number; updatedAt?: string } = {}
): Promise<void> {
  const messages = await store.listRecentMessages(projectId, 16);
  await store.putSummary({
    projectId,
    summary: buildRollingSummary(messages, options.maxChars),
    updatedAt: options.updatedAt ?? new Date().toISOString()
  });
}

function summarizeMessage(message: WorkspaceChatMessage): string {
  const label = message.role === "user" ? "User" : "Assistant";
  const normalized = message.content.replace(/\s+/g, " ").trim();
  const content =
    normalized.length <= MAX_MESSAGE_SUMMARY_CHARS
      ? normalized
      : `${normalized.slice(0, MAX_MESSAGE_SUMMARY_CHARS - 1)}…`;
  const commit =
    message.role === "assistant" && message.commitSha ? ` (commit ${message.commitSha})` : "";
  return `${label}: ${content}${commit}`;
}
