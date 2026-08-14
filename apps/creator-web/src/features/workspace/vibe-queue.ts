import type { WorkspaceAgentMode } from "@evcp/api-client";

// Prompt queue ("ถังงาน"): requests submitted while the AI is busy wait here in order.
// The chat hook drains it one item per finished turn; each item leaves the queue the
// moment it becomes a real chat message, and the ✕ removes one before it runs.

export type QueuedPrompt = { id: string; prompt: string; mode: WorkspaceAgentMode };

export const MAX_QUEUED_PROMPTS = 10;

let sequence = 0;

export function enqueuePrompt(
  queue: QueuedPrompt[],
  input: { prompt: string; mode: WorkspaceAgentMode }
): QueuedPrompt[] {
  const prompt = input.prompt.trim();
  if (!prompt || queue.length >= MAX_QUEUED_PROMPTS) return queue;
  sequence += 1;
  return [...queue, { id: `qp-${Date.now()}-${sequence}`, prompt, mode: input.mode }];
}

export function removeQueued(queue: QueuedPrompt[], id: string): QueuedPrompt[] {
  return queue.filter((item) => item.id !== id);
}

export function takeNext(queue: QueuedPrompt[]): {
  next: QueuedPrompt | undefined;
  rest: QueuedPrompt[];
} {
  const [next, ...rest] = queue;
  return { next, rest };
}
