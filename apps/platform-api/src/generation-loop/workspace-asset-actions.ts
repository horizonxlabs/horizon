import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import { boundedExecutionError } from "./action-execution-boundary";
import type { ActionResult, RunnableAction } from "./action-runner-types";
import { normalizeProjectPath } from "./pi-tool-policy";
import { shellQuote, workspaceWriteCommand } from "./workspace-file-actions";

type AssetAction = Extract<RunnableAction, { type: "asset" }>;

// Binary-safe workspace write for GENERATED assets (AI images). Deliberately separate from
// the text file action: content is base64 end-to-end (a UTF-8 re-encode would corrupt it),
// and the text-oriented guards (conflict-marker scan, whole-file-rewrite limit) do not
// apply to binary payloads. The payload is appended to a temp file in bounded chunks so no
// single exec argv approaches ARG_MAX, then decoded into place atomically-enough.
const BASE64_CHUNK_CHARS = 200_000;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function failed(error: string): ActionResult {
  return { ok: false, error, stdout: "", stderr: "", exitCode: -1 };
}

export async function runWorkspaceAssetAction(input: {
  docker: DockerEngine;
  containerId: string;
  template: GoldenTemplate;
  action: AssetAction;
}): Promise<ActionResult> {
  const { action, docker, containerId, template } = input;
  if (isLockedFile(template, action.filePath.trim()))
    return failed(`refusing to write locked file '${action.filePath.trim()}'`);
  let filePath: string;
  try {
    filePath = normalizeProjectPath(action.filePath);
  } catch (error) {
    return boundedExecutionError((error as Error).message);
  }
  if (isLockedFile(template, filePath)) return failed(`refusing to write locked file '${filePath}'`);
  const base64 = action.base64.replace(/\s+/g, "");
  if (!base64 || !BASE64_PATTERN.test(base64) || base64.length % 4 !== 0)
    return failed(`asset content for '${filePath}' is not valid base64`);
  const byteLength = Buffer.from(base64, "base64").byteLength;

  const quotedPath = shellQuote(filePath);
  const quotedTmp = shellQuote(`${filePath}.b64.tmp`);
  const directory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ".";
  const run = async (script: string) =>
    docker.execInContainer(containerId, workspaceWriteCommand(script));
  const cleanup = () => run(`rm -f ${quotedTmp}`).catch(() => undefined);

  const prepare = await run(`mkdir -p ${shellQuote(directory)} && : > ${quotedTmp}`);
  if (prepare.exitCode !== 0) return failed(`asset write failed for '${filePath}'`);
  for (let offset = 0; offset < base64.length; offset += BASE64_CHUNK_CHARS) {
    const chunk = base64.slice(offset, offset + BASE64_CHUNK_CHARS);
    const append = await run(`printf %s '${chunk}' >> ${quotedTmp}`);
    if (append.exitCode !== 0) {
      await cleanup();
      return failed(`asset write failed for '${filePath}'`);
    }
  }
  const decode = await run(`base64 -d < ${quotedTmp} > ${quotedPath} && rm -f ${quotedTmp}`);
  if (decode.exitCode !== 0) {
    await cleanup();
    return failed(`asset write failed for '${filePath}'`);
  }
  return { ok: true, stdout: `wrote ${filePath} (${byteLength} bytes)` };
}
