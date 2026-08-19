import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { WorkspaceChatAction } from "@evcp/types";

import type { ChatStreamEvent } from "./generation-types";
import type { HorizonPiToolDetails } from "./pi-tools";
import { safeToolError } from "./pi-tool-policy";

const actionTypeByTool = {
  read_workspace_file: "file",
  list_workspace_files: "file",
  write_workspace_file: "file",
  edit_workspace_file: "edit",
  run_workspace_command: "shell",
  propose_database_migration: "migration",
  load_governed_skill: "skill"
} as const;

export function assistantTextDelta(event: AgentSessionEvent): string | undefined {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    return event.assistantMessageEvent.delta;
  }
  return undefined;
}

export function assistantReasoningDelta(event: AgentSessionEvent): string | undefined {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
    return event.assistantMessageEvent.delta;
  }
  return undefined;
}

// Folds a tool_execution_end event into the turn's running action ledger, returning the
// updated failedTool (the reassignment can't happen through the parameter itself since
// primitive `let` bindings aren't passed by reference).
export function collectToolExecutionEnd(
  event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
  actionIds: string[],
  actions: WorkspaceChatAction[],
  writtenPaths: Set<string>,
  failedTool: HorizonPiToolDetails | undefined
): HorizonPiToolDetails | undefined {
  const details = event.result?.details as HorizonPiToolDetails | undefined;
  if (!details) return failedTool;
  const terminalValidationPassed =
    details.ok &&
    !event.isError &&
    typeof event.result === "object" &&
    event.result !== null &&
    (event.result as { terminate?: unknown }).terminate === true;
  let next = terminalValidationPassed ? undefined : failedTool;
  if (details.ok && !event.isError && (details.actionType === "file" || details.actionType === "edit")) {
    writtenPaths.add(details.label);
    if (next?.label === details.label) next = undefined;
  }
  actionIds.push(event.toolCallId);
  actions.push({
    id: event.toolCallId,
    type: details.actionType,
    label: details.label,
    ok: details.ok && !event.isError
  });
  if (!details.ok || event.isError) next = details;
  return next;
}

export function adaptPiEvent(event: AgentSessionEvent): ChatStreamEvent[] {
  if (event.type === "message_update") {
    const update = event.assistantMessageEvent;
    if (update.type === "text_delta") return [{ type: "token", content: update.delta }];
    if (update.type === "thinking_delta") {
      return [{ type: "reasoning", content: update.delta }];
    }
    return [];
  }
  if (event.type === "tool_execution_start") {
    const actionType = actionTypeFor(event.toolName);
    if (!actionType) return [];
    return [
      {
        type: "action_start",
        actionId: event.toolCallId,
        actionType,
        label: toolLabel(event.toolName, event.args)
      }
    ];
  }
  if (event.type === "tool_execution_update") {
    const content = toolText(event.partialResult);
    return content ? [{ type: "action_chunk", actionId: event.toolCallId, content }] : [];
  }
  if (event.type === "tool_execution_end") {
    const details = toolDetails(event.result);
    const actionType = details?.actionType ?? actionTypeFor(event.toolName);
    if (!actionType) return [];
    const error = details?.error ? safeToolError(details.error) : undefined;
    return [
      {
        type: "action_result",
        actionId: event.toolCallId,
        actionType,
        label: details?.label ?? event.toolName,
        ok: details?.ok === true && !event.isError,
        ...(details?.find !== undefined ? { find: details.find } : {}),
        ...(details?.replace !== undefined ? { replace: details.replace } : {}),
        ...(details?.body !== undefined ? { body: details.body } : {}),
        ...(error ? { error } : {})
      }
    ];
  }
  if (event.type === "auto_retry_end" && !event.success) {
    return [{ type: "error", message: safeToolError(event.finalError ?? "Pi retry failed") }];
  }
  if (event.type === "compaction_end" && !event.willRetry && event.errorMessage) {
    return [{ type: "error", message: safeToolError(event.errorMessage) }];
  }
  return [];
}

function actionTypeFor(toolName: string) {
  return actionTypeByTool[toolName as keyof typeof actionTypeByTool];
}

function toolLabel(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return toolName;
  const values = args as Record<string, unknown>;
  return String(values.path ?? values.name ?? values.command ?? toolName);
}

function toolText(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((block): block is { type: "text"; text: string } =>
      Boolean(
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      )
    )
    .map((block) => block.text)
    .join("");
  return text || undefined;
}

function toolDetails(result: unknown): HorizonPiToolDetails | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const candidate = details as Partial<HorizonPiToolDetails>;
  if (
    typeof candidate.actionId !== "string" ||
    typeof candidate.actionType !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.ok !== "boolean"
  ) {
    return undefined;
  }
  return candidate as HorizonPiToolDetails;
}
