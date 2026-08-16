import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import { boundedExecutionError } from "./action-execution-boundary";
import type { ActionResult, RunnableAction } from "./action-runner-types";
import { applyFindReplace } from "./find-replace";
import { normalizeProjectPath } from "./pi-tool-policy";

type FileAction = Extract<RunnableAction, { type: "file" }>;
type EditAction = Extract<RunnableAction, { type: "edit" }>;

export function workspaceWriteCommand(script: string): string[] {
  return ["su", "-s", "/bin/sh", "evcp", "-c", script];
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function conflictMarkerLine(text: string): string | undefined {
  return text.match(/^(?:<{7,}|={7,}|>{7,}|\|{7,})(?:[ \t].*)?$/m)?.[0];
}

function lockedActionError(action: FileAction | EditAction, filePath: string): ActionResult {
  return {
    ok: false,
    error: `refusing to ${action.type === "file" ? "write" : "edit"} locked file '${filePath}'`,
    stdout: "",
    stderr: "",
    exitCode: -1
  };
}

function safeActionPath(
  template: GoldenTemplate,
  action: FileAction | EditAction
): string | ActionResult {
  const requestedPath = action.filePath.trim();
  if (isLockedFile(template, requestedPath)) return lockedActionError(action, requestedPath);
  try {
    const normalized = normalizeProjectPath(action.filePath);
    return isLockedFile(template, normalized) ? lockedActionError(action, normalized) : normalized;
  } catch (error) {
    return boundedExecutionError((error as Error).message);
  }
}

async function applyEditToFile(
  docker: DockerEngine,
  containerId: string,
  filePath: string,
  find: string,
  replace: string
): Promise<ActionResult> {
  const quotedPath = shellQuote(filePath);
  const read = await docker.execInContainer(
    containerId,
    workspaceWriteCommand(`base64 < ${quotedPath} 2>/dev/null || echo __EVCP_MISSING__`)
  );
  const raw = (read.stdout ?? "").trim();
  if (raw === "__EVCP_MISSING__" || raw === "") {
    return {
      ok: false,
      error: `cannot edit '${filePath}': file not found`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const current = Buffer.from(raw, "base64").toString("utf8");
  const edited = applyFindReplace(current, find, replace);
  if (!edited.ok) {
    const detail =
      edited.reason === "not_found"
        ? "the SEARCH text was not found in the file (it must match the current file exactly)"
        : "the SEARCH text appears more than once; include more surrounding context so it is unique";
    return {
      ok: false,
      error: `edit of '${filePath}' failed: ${detail}`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const encoded = Buffer.from(edited.content, "utf8").toString("base64");
  const result = await docker.execInContainer(
    containerId,
    workspaceWriteCommand(`echo ${encoded} | base64 -d > ${quotedPath}`)
  );
  return result.exitCode === 0
    ? { ok: true, stdout: result.stdout }
    : {
        ok: false,
        error: "edit write failed",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
}

const WHOLE_FILE_REWRITE_LIMIT = 4000;

export async function runWorkspaceFileAction(input: {
  docker: DockerEngine;
  containerId: string;
  template: GoldenTemplate;
  action: FileAction;
}): Promise<ActionResult> {
  const resolvedPath = safeActionPath(input.template, input.action);
  if (typeof resolvedPath !== "string") return resolvedPath;
  const marker = conflictMarkerLine(input.action.content);
  if (marker) {
    return {
      ok: false,
      error:
        `refusing to write '${resolvedPath}': the content contains a git conflict ` +
        `marker ("${marker.slice(0, 12)}"). Emit clean file content with no ` +
        `<<<<<<< / ======= / >>>>>>> markers.`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const sizeResult = await input.docker.execInContainer(
    input.containerId,
    workspaceWriteCommand(`wc -c < ${shellQuote(resolvedPath)} 2>/dev/null || echo -1`)
  );
  const size = Number.parseInt((sizeResult.stdout ?? "").trim(), 10);
  if (Number.isFinite(size) && size > WHOLE_FILE_REWRITE_LIMIT) {
    return {
      ok: false,
      error:
        `refusing to overwrite the existing file '${resolvedPath}' (${size} bytes) with a whole-file write. ` +
        `To change an existing file use edit_workspace_file and target only the unique text ` +
        `that must change. write_workspace_file is only for creating new files.`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const encoded = Buffer.from(input.action.content, "utf8").toString("base64");
  const dir = resolvedPath.slice(0, resolvedPath.lastIndexOf("/"));
  const script = `mkdir -p ${shellQuote(dir)} && echo ${encoded} | base64 -d > ${shellQuote(resolvedPath)}`;
  const result = await input.docker.execInContainer(
    input.containerId,
    workspaceWriteCommand(script)
  );
  return result.exitCode === 0
    ? { ok: true, stdout: result.stdout }
    : {
        ok: false,
        error: "file write failed",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
}

export async function runWorkspaceEditAction(input: {
  docker: DockerEngine;
  containerId: string;
  template: GoldenTemplate;
  action: EditAction;
}): Promise<ActionResult> {
  const resolvedPath = safeActionPath(input.template, input.action);
  if (typeof resolvedPath !== "string") return resolvedPath;
  const marker = conflictMarkerLine(input.action.replace);
  if (marker) {
    return {
      ok: false,
      error:
        `edit of '${resolvedPath}' rejected: the REPLACE text contains a git conflict ` +
        `marker ("${marker.slice(0, 12)}"). Provide only the replacement code, with no ` +
        `<<<<<<< / ======= / >>>>>>> markers.`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  return applyEditToFile(
    input.docker,
    input.containerId,
    resolvedPath,
    input.action.find,
    input.action.replace
  );
}
