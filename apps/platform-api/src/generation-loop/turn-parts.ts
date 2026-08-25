import type { WorkspaceChatToolPart, WorkspaceChatTurnPart } from "@evcp/types";

import type { ChatStreamEvent } from "./generation-types";
import { clipUtf8, safeToolError } from "./pi-tool-policy";

const MAX_TURN_PART_TEXT_BYTES = 8_192;
const MAX_TOOL_PART_TEXT_BYTES = 1_024;
const MAX_ERROR_PART_TEXT_BYTES = 1_024;
const MAX_COMMIT_SHA_BYTES = 64;

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

function clippedDisplayText(value: string, maxBytes: number): string {
  return clipUtf8(safeToolError(value), maxBytes);
}

function splitDisplayText(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const character of safeToolError(value)) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (chunk && chunkBytes + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

function commitShaDisplay(value: string): string {
  const candidate = splitDisplayText(value.trim(), MAX_COMMIT_SHA_BYTES)[0];
  return /^[a-f0-9]{7,64}$/i.test(candidate) ? candidate : "unavailable";
}

function appendAdjacentTextPart(
  parts: WorkspaceChatTurnPart[],
  type: "text" | "reasoning",
  content: string
): WorkspaceChatTurnPart[] {
  const textChunks = splitDisplayText(content, MAX_TURN_PART_TEXT_BYTES);
  const previous = parts.at(-1);
  const next = [...parts];
  if (previous?.type === type) {
    const availableBytes = MAX_TURN_PART_TEXT_BYTES - Buffer.byteLength(previous.text, "utf8");
    if (availableBytes > 0) {
      const combinedChunks = splitDisplayText(
        `${previous.text}${textChunks.join("")}`,
        MAX_TURN_PART_TEXT_BYTES
      );
      next[next.length - 1] = { ...previous, text: combinedChunks[0] };
      textChunks.splice(0, textChunks.length, ...combinedChunks.slice(1));
    }
  }
  for (const text of textChunks) {
    const sequence = nextSequence(next);
    next.push({ id: `${type}-${sequence}`, type, sequence, text });
  }
  return next;
}

function fallbackToolPresentation(actionType: WorkspaceChatToolPart["actionType"]) {
  const labels = {
    read: "Read workspace file",
    list: "List workspace files",
    file: "Write workspace file",
    edit: "Edit workspace file",
    shell: "Run workspace command",
    migration: "Prepare database migration",
    skill: "Load governed skill"
  } as const;
  const label = labels[actionType];
  return { label, inputSummary: `${label} requested` };
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
    const presentation = fallbackToolPresentation(event.actionType);
    return [
      ...parts,
      {
        id: event.actionId,
        type: "tool",
        sequence,
        tool: {
          callId: event.actionId,
          actionType: event.actionType,
          ...presentation,
          label: presentation.label,
          inputSummary: clippedDisplayText(
            event.inputSummary ?? presentation.inputSummary,
            MAX_TOOL_PART_TEXT_BYTES
          ),
          startedAt: event.startedAt ?? new Date().toISOString(),
          status: "running"
        }
      }
    ];
  }

  if (event.type === "action_chunk") {
    return replaceToolPart(parts, event.actionId, (tool) => ({
      ...tool,
      progress: clippedDisplayText(event.content, MAX_TOOL_PART_TEXT_BYTES)
    }));
  }

  if (event.type === "action_result") {
    return replaceToolPart(parts, event.actionId, (tool) => {
      const shared = {
        callId: event.actionId,
        actionType: event.actionType,
        ...fallbackToolPresentation(event.actionType),
        label: fallbackToolPresentation(event.actionType).label,
        startedAt: tool.startedAt,
        endedAt: event.endedAt ?? new Date().toISOString(),
        ...(tool.progress === undefined ? {} : { progress: tool.progress })
      };
      if (event.ok) {
        return {
          ...shared,
          status: "done",
          ...(event.body === undefined
            ? {}
            : { result: clippedDisplayText(event.body, MAX_TOOL_PART_TEXT_BYTES) })
        };
      }
      return {
        ...shared,
        status: "failed",
        error: clippedDisplayText(event.error ?? event.body ?? "Tool execution failed", MAX_TOOL_PART_TEXT_BYTES)
      };
    });
  }

  if (event.type === "done") return parts;

  if (event.type === "token") {
    return appendAdjacentTextPart(parts, "text", event.content);
  }
  if (event.type === "reasoning") {
    return appendAdjacentTextPart(parts, "reasoning", event.content);
  }
  const sequence = nextSequence(parts);
  if (event.type === "commit") {
    return [
      ...parts,
      { id: `commit-${sequence}`, type: "commit", sequence, sha: commitShaDisplay(event.sha) }
    ];
  }
  return [
    ...parts,
    {
      id: `error-${sequence}`,
      type: "error",
      sequence,
      message: clippedDisplayText(event.message, MAX_ERROR_PART_TEXT_BYTES)
    }
  ];
}
