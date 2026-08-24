import { AUTO_DEBUG_PREFIX } from "./VibeUserBubble";
import type { VibeMessage } from "./vibe-stream";

// Lovable-style version history: every committed turn is a version, navigated by the
// PROMPT that created it. Derived purely from chat history — the log is the memory.

export type WorkspaceVersion = {
  version: number;
  commitSha: string;
  prompt: string;
  isAutoDebug: boolean;
  isCurrent: boolean;
};

export function buildVersionHistory(messages: VibeMessage[]): WorkspaceVersion[] {
  const versions: WorkspaceVersion[] = [];
  let lastUserPrompt = "";
  for (const message of messages) {
    if (message.role === "user") {
      lastUserPrompt = message.text;
      continue;
    }
    if (!message.commitSha) continue;
    const isAutoDebug = lastUserPrompt.startsWith(AUTO_DEBUG_PREFIX);
    versions.push({
      version: versions.length + 1,
      commitSha: message.commitSha,
      prompt: isAutoDebug ? "Automated system fix (self-debug)" : lastUserPrompt,
      isAutoDebug,
      isCurrent: false
    });
  }
  const newestFirst = [...versions].reverse();
  if (newestFirst.length > 0) newestFirst[0] = { ...newestFirst[0], isCurrent: true };
  return newestFirst;
}
