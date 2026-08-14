import { Type, type TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import type { ActionRunner, RunnableAction } from "./action-runner-types";
import type { GenerationServiceDeps } from "./generation-service-types";
import { containsTransactionControl } from "./migration-runner";
import {
  assertInputLimit,
  assertSafeCommand,
  clipUtf8,
  normalizeProjectPath,
  safeToolError,
  type PiAgentToolLimits
} from "./pi-tool-policy";

export type HorizonPiToolDetails = {
  actionId: string;
  actionType: "file" | "edit" | "shell" | "migration" | "skill";
  label: string;
  ok: boolean;
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
  onAudit?: GenerationServiceDeps["onAudit"];
};

export function createHorizonPiTools(context: HorizonPiToolContext): ToolDefinition[] {
  const read = tool(
    context,
    "read_workspace_file",
    "Read workspace file",
    "Read one existing project file.",
    Type.Object({ path: Type.String() }, { additionalProperties: false }),
    async (id, params) => {
      const path = normalizeProjectPath(params.path);
      const file = (await context.readWorkspaceFiles(context.containerId)).find(
        (candidate) => candidate.path === path
      );
      if (!file) throw new Error(`workspace file '${path}' was not found`);
      return success(id, "file", path, context, { body: file.content }, file.content);
    }
  );
  const list = tool(
    context,
    "list_workspace_files",
    "List workspace files",
    "List bounded project files, optionally under a project-relative prefix.",
    Type.Object({ prefix: Type.Optional(Type.String()) }, { additionalProperties: false }),
    async (id, params) => {
      const prefix = params.prefix
        ? normalizeProjectPath(params.prefix, { allowRoot: true })
        : undefined;
      const paths = (await context.readWorkspaceFiles(context.containerId))
        .map((file) => file.path)
        .filter((path) => !prefix || path === prefix || path.startsWith(`${prefix}/`))
        .sort();
      const body = paths.join("\n") || "(no matching workspace files)";
      return success(id, "file", prefix ?? "workspace files", context, { body }, body);
    }
  );
  const write = tool(
    context,
    "write_workspace_file",
    "Write workspace file",
    "Create one new file in an allowed project root.",
    Type.Object({ path: Type.String(), content: Type.String() }, { additionalProperties: false }),
    async (id, params) => {
      const path = normalizeProjectPath(params.path);
      assertUnlocked(context.template, path);
      const files = await context.readWorkspaceFiles(context.containerId);
      if (files.some((file) => file.path === path)) {
        throw new Error(`workspace file '${path}' already exists; use edit_workspace_file`);
      }
      return runAction(context, {
        id,
        type: "file",
        filePath: path,
        content: params.content
      });
    }
  );
  const edit = tool(
    context,
    "edit_workspace_file",
    "Edit workspace file",
    "Replace one unique exact snippet in an existing project file.",
    Type.Object(
      { path: Type.String(), find: Type.String(), replace: Type.String() },
      { additionalProperties: false }
    ),
    async (id, params) => {
      const path = normalizeProjectPath(params.path);
      assertUnlocked(context.template, path);
      if (!params.find) throw new Error("edit find text is required");
      const file = (await context.readWorkspaceFiles(context.containerId)).find(
        (candidate) => candidate.path === path
      );
      if (!file) throw new Error(`workspace file '${path}' was not found`);
      const count = file.content.split(params.find).length - 1;
      if (count !== 1) {
        throw new Error(
          count === 0 ? "edit find text was not found" : "edit find text is not unique"
        );
      }
      return runAction(context, {
        id,
        type: "edit",
        filePath: path,
        find: params.find,
        replace: params.replace
      });
    }
  );
  const shell = tool(
    context,
    "run_workspace_command",
    "Run workspace command",
    "Run one allowlisted command with direct arguments in the project container.",
    Type.Object(
      {
        command: Type.String(),
        args: Type.Array(Type.String()),
        timeoutMs: Type.Optional(Type.Number())
      },
      { additionalProperties: false }
    ),
    async (id, params, onUpdate) => {
      assertSafeCommand(params.command, params.args);
      const timeoutMs = Math.min(
        positiveInteger(params.timeoutMs ?? context.limits.shellTimeoutMs, "timeoutMs"),
        context.limits.shellTimeoutMs
      );
      return runAction(
        context,
        { id, type: "shell", command: params.command, args: params.args },
        timeoutMs,
        onUpdate
      );
    }
  );
  const migration = tool(
    context,
    "propose_database_migration",
    "Propose database migration",
    "Validate and buffer one migration for the outer transaction.",
    Type.Object({ name: Type.String(), sql: Type.String() }, { additionalProperties: false }),
    async (id, params) => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(params.name)) {
        throw new Error("migration name is invalid");
      }
      if (!params.sql.trim()) throw new Error("migration SQL is required");
      if (containsTransactionControl([params.sql])) {
        throw new Error("migration transaction control is not allowed");
      }
      context.migrationBuffer.push({
        id,
        type: "migration",
        name: params.name,
        sql: params.sql
      });
      return success(id, "migration", params.name, context, { body: params.sql }, params.sql);
    }
  );
  const skill = tool(
    context,
    "load_governed_skill",
    "Load governed skill",
    "Load approved skill instructions by exact name.",
    Type.Object({ name: Type.String() }, { additionalProperties: false }),
    async (id, params) => {
      const instruction = context.skillInstructions[params.name];
      if (!instruction) throw new Error(`governed skill '${params.name}' is not available`);
      return success(id, "skill", params.name, context, { body: instruction }, instruction);
    }
  );
  return [read, list, write, edit, shell, migration, skill];
}

function tool<TParams extends TSchema>(
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

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: HorizonPiToolDetails };

function actionTypeFor(name: string): HorizonPiToolDetails["actionType"] {
  if (name === "edit_workspace_file") return "edit";
  if (name === "run_workspace_command") return "shell";
  if (name === "propose_database_migration") return "migration";
  if (name === "load_governed_skill") return "skill";
  return "file";
}

function labelFor(name: string, params: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return name;
  const values = params as Record<string, unknown>;
  return String(values.path ?? values.name ?? values.command ?? name);
}

function assertUnlocked(template: GoldenTemplate, path: string): void {
  if (isLockedFile(template, path)) throw new Error(`workspace file '${path}' is locked`);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function success(
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

async function runAction(
  context: HorizonPiToolContext,
  action: Exclude<RunnableAction, { type: "migration" }>,
  timeoutMs?: number,
  onUpdate?: (result: ToolResult) => void
): Promise<ToolResult> {
  const details: HorizonPiToolDetails = {
    actionId: action.id,
    actionType: action.type,
    label: action.type === "shell" ? action.command : action.filePath,
    ok: true,
    ...(action.type === "file" ? { body: action.content } : {}),
    ...(action.type === "edit" ? { find: action.find, replace: action.replace } : {})
  };
  const result = await context.actionRunner.runAction({
    containerId: context.containerId,
    projectId: context.projectId,
    template: context.template,
    action,
    signal: context.signal,
    timeoutMs,
    maxOutputBytes: context.limits.maxToolOutputBytes,
    onShellOutput: (chunk) =>
      onUpdate?.({
        content: [{ type: "text", text: clipUtf8(chunk, context.limits.maxToolOutputBytes) }],
        details
      })
  });
  if (!result.ok) throw new Error(result.error);
  const text = action.type === "shell" ? result.stdout : "ok";
  return success(action.id, action.type, details.label, context, details, text);
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
