import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { WorkspaceChatAction } from "@evcp/types";

import type { ActionActionType, ChatStreamEvent } from "./generation-types";
import type { HorizonPiToolDetails } from "./pi-tools";
import { clipUtf8, safeToolError } from "./pi-tool-policy";

const actionTypeByTool = {
  read_workspace_file: "read",
  list_workspace_files: "list",
  write_workspace_file: "file",
  edit_workspace_file: "edit",
  run_workspace_command: "shell",
  propose_database_migration: "migration",
  load_governed_skill: "skill",
  generate_image: "image"
} as const;

const MAX_TOOL_EVENT_SUMMARY_BYTES = 1_024;
const actionTypes = new Set<ActionActionType>([
  "read",
  "list",
  "file",
  "edit",
  "shell",
  "migration",
  "skill",
  "image"
]);

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
  const details = toolDetails(event.result);
  if (!details) return failedTool;
  const terminalValidationPassed =
    details.ok &&
    !event.isError &&
    typeof event.result === "object" &&
    event.result !== null &&
    (event.result as { terminate?: unknown }).terminate === true;
  let next = terminalValidationPassed ? undefined : failedTool;
  if (
    details.ok &&
    !event.isError &&
    (details.actionType === "file" || details.actionType === "edit")
  ) {
    writtenPaths.add(details.label);
    if (next?.label === details.label) next = undefined;
  }
  const presentation = toolPresentation(details.actionType);
  actionIds.push(event.toolCallId);
  actions.push({
    id: event.toolCallId,
    type: details.actionType,
    label: presentation.label,
    ok: details.ok && !event.isError
  });
  if ((!details.ok || event.isError) && !details.softFailure) next = details;
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
    const presentation = toolPresentation(actionType);
    return [
      {
        type: "action_start",
        actionId: event.toolCallId,
        actionType,
        label: presentation.label,
        inputSummary: presentation.inputSummary,
        startedAt: new Date().toISOString()
      }
    ];
  }
  if (event.type === "tool_execution_update") {
    const actionType = actionTypeFor(event.toolName);
    return actionType
      ? [{ type: "action_chunk", actionId: event.toolCallId, content: "Tool is running" }]
      : [];
  }
  if (event.type === "tool_execution_end") {
    const details = toolDetails(event.result);
    const actionType = actionTypeFor(event.toolName) ?? details?.actionType;
    if (!actionType) return [];
    const presentation = toolPresentation(actionType);
    return [
      {
        type: "action_result",
        actionId: event.toolCallId,
        actionType,
        label: presentation.label,
        ok: details?.ok === true && !event.isError,
        ...(details?.ok === true && !event.isError ? { body: presentation.successSummary } : {}),
        ...(!details?.ok || event.isError ? { error: presentation.failureSummary } : {}),
        endedAt: new Date().toISOString()
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

function isActionType(value: unknown): value is ActionActionType {
  return typeof value === "string" && actionTypes.has(value as ActionActionType);
}

function toolPresentation(actionType: NonNullable<ReturnType<typeof actionTypeFor>>) {
  const presentations = {
    read: {
      label: "Read workspace file",
      inputSummary: "Read workspace file requested",
      successSummary: "Workspace file read",
      failureSummary: "Workspace file read failed"
    },
    list: {
      label: "List workspace files",
      inputSummary: "List workspace files requested",
      successSummary: "Workspace files listed",
      failureSummary: "Workspace file listing failed"
    },
    file: {
      label: "Write workspace file",
      inputSummary: "Write workspace file requested",
      successSummary: "Workspace file updated",
      failureSummary: "Workspace file update failed"
    },
    edit: {
      label: "Edit workspace file",
      inputSummary: "Edit workspace file requested",
      successSummary: "Workspace file updated",
      failureSummary: "Workspace file update failed"
    },
    shell: {
      label: "Run workspace command",
      inputSummary: "Approved workspace command requested",
      successSummary: "Workspace command completed",
      failureSummary: "Workspace command failed"
    },
    migration: {
      label: "Prepare database migration",
      inputSummary: "Database migration requested",
      successSummary: "Database migration prepared",
      failureSummary: "Database migration preparation failed"
    },
    skill: {
      label: "Load governed skill",
      inputSummary: "Governed skill requested",
      successSummary: "Governed skill loaded",
      failureSummary: "Governed skill load failed"
    },
    image: {
      label: "Generate image",
      inputSummary: "Image generation requested",
      successSummary: "Image generated",
      failureSummary: "Image generation failed"
    }
  } as const;
  const presentation = presentations[actionType];
  return {
    ...presentation,
    inputSummary: clipUtf8(presentation.inputSummary, MAX_TOOL_EVENT_SUMMARY_BYTES),
    successSummary: clipUtf8(presentation.successSummary, MAX_TOOL_EVENT_SUMMARY_BYTES),
    failureSummary: clipUtf8(presentation.failureSummary, MAX_TOOL_EVENT_SUMMARY_BYTES)
  };
}

function toolDetails(result: unknown): HorizonPiToolDetails | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const candidate = details as Partial<HorizonPiToolDetails>;
  if (
    typeof candidate.actionId !== "string" ||
    !isActionType(candidate.actionType) ||
    typeof candidate.label !== "string" ||
    typeof candidate.ok !== "boolean"
  ) {
    return undefined;
  }
  return candidate as HorizonPiToolDetails;
}
