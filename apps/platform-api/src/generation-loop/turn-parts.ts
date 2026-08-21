import type { WorkspaceChatToolPart, WorkspaceChatTurnPart } from "@evcp/types";

import type { ChatStreamEvent } from "./generation-types";

function nextSequence(parts: WorkspaceChatTurnPart[]): number {
  return parts.reduce((highest, part) => Math.max(highest, part.sequence), 0) + 1;
}

function replaceToolPart(
  parts: WorkspaceChatTurnPart[],
  actionId: string,
  update: (tool: WorkspaceChatToolPart) => WorkspaceChatToolPart
): WorkspaceChatTurnPart[] {
  const index = parts.findIndex((part) => part.type === "tool" && part.id === actionId);
  if (index < 0) return parts;

  const part = parts[index];
  if (part.type !== "tool") return parts;
  const next = [...parts];
  next[index] = { ...part, tool: update(part.tool) };
  return next;
}

/**
 * Projects one approved generation event into the durable, display-safe turn
 * timeline. Tool progress is a snapshot, so updates replace their matching
 * tool part rather than adding another timeline row.
 */
export function reduceTurnPart(
  parts: WorkspaceChatTurnPart[],
  event: ChatStreamEvent
): WorkspaceChatTurnPart[] {
  if (event.type === "action_start") {
    if (parts.some((part) => part.type === "tool" && part.id === event.actionId)) return parts;
    const sequence = nextSequence(parts);
    return [
      ...parts,
      {
        id: event.actionId,
        type: "tool",
        sequence,
        tool: { actionType: event.actionType, label: event.label, status: "running" }
      }
    ];
  }

  if (event.type === "action_chunk") {
    return replaceToolPart(parts, event.actionId, (tool) => ({ ...tool, progress: event.content }));
  }

  if (event.type === "action_result") {
    return replaceToolPart(parts, event.actionId, (tool) => {
      const shared = {
        actionType: event.actionType,
        label: event.label,
        ...(tool.progress === undefined ? {} : { progress: tool.progress })
      };
      if (event.ok) {
        return { ...shared, status: "done", ...(event.body === undefined ? {} : { result: event.body }) };
      }
      return {
        ...shared,
        status: "failed",
        error: event.error ?? event.body ?? event.label
      };
    });
  }

  if (event.type === "done") return parts;

  const sequence = nextSequence(parts);
  if (event.type === "token") {
    return [...parts, { id: `text-${sequence}`, type: "text", sequence, text: event.content }];
  }
  if (event.type === "reasoning") {
    return [...parts, { id: `reasoning-${sequence}`, type: "reasoning", sequence, text: event.content }];
  }
  if (event.type === "commit") {
    return [...parts, { id: `commit-${sequence}`, type: "commit", sequence, sha: event.sha }];
  }
  return [...parts, { id: `error-${sequence}`, type: "error", sequence, message: event.message }];
}
