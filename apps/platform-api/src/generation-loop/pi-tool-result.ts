import { type TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { GoldenTemplate } from "../workspace-orchestrator/template";
import type { ActionRunner, RunnableAction } from "./action-runner-types";
import type { GenerationServiceDeps } from "./generation-service-types";
import {
  assertInputLimit,
  clipUtf8,
  safeToolError,
  type PiAgentToolLimits
} from "./pi-tool-policy";

// Shared plumbing for Horizon Pi tools — the tool() wrapper (abort/budget/limit/audit/
// safe-error invariants) and the success/failure result builders. Extracted from
// pi-tools.ts, which sits against the 400-line ratchet.

export type HorizonPiToolDetails = {
  actionId: string;
  actionType: "read" | "list" | "file" | "edit" | "shell" | "migration" | "skill" | "image";
  label: string;
  ok: boolean;
  softFailure?: boolean;
  body?: string;
  find?: string;
  replace?: string;
  error?: string;
};

export type HorizonPiToolContext = {
  projectId: string;
  containerId: string;
  template: GoldenTemplate;
  actionRunner: ActionRunner;
  readWorkspaceFiles: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  skillInstructions: Readonly<Record<string, string>>;
  migrationBuffer: Array<Extract<RunnableAction, { type: "migration" }>>;
  signal: AbortSignal;
  limits: PiAgentToolLimits;
  nextToolCall(): void;
  // Image generation (generate_image tool). All optional: absent = the tool fails soft
  // with a "not configured" text and the build continues without images.
  listWorkspaceTree?: (containerId: string) => Promise<string[]>;
  nextImageCall?(): void;
  generateImage?: (input: { prompt: string; aspectRatio?: string }) => Promise<{
    status: string;
    base64?: string;
    mimeType?: string;
    failureReason?: string;
  }>;
  onAudit?: GenerationServiceDeps["onAudit"];
};

export function tool<TParams extends TSchema>(
  context: HorizonPiToolContext,
  name: string,
  label: string,
  description: string,
  parameters: TParams,
  execute: (id: string, params: any, onUpdate?: (result: ToolResult) => void) => Promise<ToolResult>
): ToolDefinition {
  return {
    name,
    label,
    description,
    parameters,
    async execute(id, params, signal, onUpdate) {
      try {
        if (signal?.aborted || context.signal.aborted) throw new Error("tool call aborted");
        context.nextToolCall();
        assertInputLimit(params, context.limits.maxToolInputBytes);
        const result = await execute(id, params, onUpdate);
        context.onAudit?.({
          action: "pi_tool",
          projectId: context.projectId,
          metadata: { toolName: name, actionId: id, ok: result.details.ok }
        });
        return result;
      } catch (error) {
        const message = clipUtf8(safeToolError(error), context.limits.maxToolOutputBytes);
        context.onAudit?.({
          action: "pi_tool",
          projectId: context.projectId,
          metadata: { toolName: name, actionId: id, ok: false }
        });
        return {
          content: [{ type: "text", text: message }],
          details: {
            actionId: id,
            actionType: actionTypeFor(name),
            label: labelFor(name, params),
            ok: false,
            error: message
          }
        };
      }
    }
  };
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: HorizonPiToolDetails;
  terminate?: boolean;
};

export function actionTypeFor(name: string): HorizonPiToolDetails["actionType"] {
  if (name === "read_workspace_file") return "read";
  if (name === "list_workspace_files") return "list";
  if (name === "edit_workspace_file") return "edit";
  if (name === "run_workspace_command") return "shell";
  if (name === "propose_database_migration") return "migration";
  if (name === "load_governed_skill") return "skill";
  if (name === "generate_image") return "image";
  return "file";
}

function labelFor(name: string, params: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return name;
  const values = params as Record<string, unknown>;
  return String(values.path ?? values.name ?? values.command ?? name);
}

export function success(
  id: string,
  actionType: HorizonPiToolDetails["actionType"],
  label: string,
  context: HorizonPiToolContext,
  preview: Pick<HorizonPiToolDetails, "body" | "find" | "replace">,
  text: string
): ToolResult {
  const bounded = clipUtf8(text, context.limits.maxToolOutputBytes);
  return {
    content: [{ type: "text", text: bounded }],
    details: { actionId: id, actionType, label, ok: true, ...boundedPreview(preview, context) }
  };
}

// Mirrors success(), but for a known failure that still has an attempted find/replace or body to
// show — keeps a failed action's diff inspectable in the UI instead of just an error string.
export function failure(
  id: string,
  actionType: HorizonPiToolDetails["actionType"],
  label: string,
  context: HorizonPiToolContext,
  preview: Pick<HorizonPiToolDetails, "body" | "find" | "replace">,
  error: string
): ToolResult {
  const message = clipUtf8(safeToolError(error), context.limits.maxToolOutputBytes);
  return {
    content: [{ type: "text", text: message }],
    details: {
      actionId: id,
      actionType,
      label,
      ok: false,
      error: message,
      ...boundedPreview(preview, context)
    }
  };
}

function boundedPreview(
  preview: Pick<HorizonPiToolDetails, "body" | "find" | "replace">,
  context: HorizonPiToolContext
) {
  return {
    ...(preview.body === undefined
      ? {}
      : { body: clipUtf8(preview.body, context.limits.maxToolOutputBytes) }),
    ...(preview.find === undefined
      ? {}
      : { find: clipUtf8(preview.find, context.limits.maxToolOutputBytes) }),
    ...(preview.replace === undefined
      ? {}
      : { replace: clipUtf8(preview.replace, context.limits.maxToolOutputBytes) })
  };
}
