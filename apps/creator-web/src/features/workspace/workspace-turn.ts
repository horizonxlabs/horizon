import type { VibeMessage } from "./vibe-stream";

export function latestUserMessageIndex(messages: VibeMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

export function currentWorkspaceTurnStart(messages: VibeMessage[]): number {
  const latestUserIndex = latestUserMessageIndex(messages);
  if (latestUserIndex >= 0) return latestUserIndex;
  return Math.max(0, messages.length - 1);
}
