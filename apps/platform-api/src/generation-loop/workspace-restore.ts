import type { WorkspaceChatMessage } from "@evcp/types";

// Turn-level code rollback: restore the workspace to a previous turn's commit. Serialized
// on the same per-project lock as generation turns (a restore must never race a running
// build), and logged into chat history so later turns know the code was rolled back —
// with no PRD in the loop, the chat log IS the project's memory.

type RestoreDeps = {
  lock: { acquire(projectId: string): Promise<() => void> };
  guard: { restore(projectId: string, commitSha: string): Promise<void> };
  chatHistory: { appendMessage(message: WorkspaceChatMessage): Promise<unknown> };
};

export async function restoreWorkspaceCommit(
  deps: RestoreDeps,
  projectId: string,
  commitSha: string
): Promise<void> {
  if (!/^[0-9a-f]{4,64}$/i.test(commitSha)) {
    throw new Error("invalid workspace commit SHA");
  }
  const release = await deps.lock.acquire(projectId);
  try {
    await deps.guard.restore(projectId, commitSha);
    await deps.chatHistory.appendMessage({
      id: `msg_restore_${Date.now()}`,
      projectId,
      role: "assistant",
      content: `⏪ Rolled the code back to commit ${commitSha.slice(0, 8)}. Everything built after that commit was removed from the app — treat this commit as the app's current state in later turns.`,
      createdAt: new Date().toISOString()
    } as WorkspaceChatMessage);
  } finally {
    release();
  }
}
