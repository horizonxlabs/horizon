// In-turn write checks (detection layer 1): catch syntax errors and broken local imports
// the moment a file lands — the model fixes them in the SAME turn via the round-retry
// feedback, long before the full build validation (and before the user sees anything).

import type { PiGenerationServiceDeps } from "./generation-service-types";
import type { PiAgentLimits } from "./pi-limits";
import { filterAgentWorkspaceFiles } from "./pi-tool-policy";

const IMPORT_PATTERN = /import\s[^'"]*['"]([^'"]+)['"]/g;
// Matches pi-tool-policy.ts's SAFE_PROJECT_SEGMENT bracket allowance: without [ ] here,
// this quietly no-ops the in-turn syntax check for any Next.js dynamic route (the failure
// is swallowed by collectWriteIssues' .catch(() => ""), so it never surfaces as an error —
// it just silently stops catching syntax mistakes in those files).
const SAFE_PATH = /^[\w@./[\]-]+$/;

function normalizeImport(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const baseSegments = fromFile.split("/").slice(0, -1);
    for (const segment of specifier.split("/")) {
      if (segment === "." || segment === "") continue;
      if (segment === "..") baseSegments.pop();
      else baseSegments.push(segment);
    }
    return baseSegments.join("/");
  }
  return null; // package import — the build validates those
}

const RESOLVABLE_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", ".css", "/index.ts", "/index.tsx"];

export function findMissingImports(
  fromFile: string,
  content: string,
  knownPaths: Set<string>
): string[] {
  const missing: string[] = [];
  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const normalized = normalizeImport(fromFile, match[1]);
    if (!normalized) continue;
    const found = RESOLVABLE_SUFFIXES.some((suffix) => knownPaths.has(`${normalized}${suffix}`));
    if (!found && !missing.includes(normalized)) missing.push(normalized);
  }
  return missing;
}

// A resolution-free check must also skip semantic checking: --noResolve omits Node's
// ambient declarations, so valid process.env references otherwise fail with TS2580.
// --noCheck still reports syntax errors; the full project build validates all types.
export function buildSyntaxCheckCommand(path: string): string {
  if (!SAFE_PATH.test(path)) throw new Error(`unsafe workspace path: ${path}`);
  return `cd /workspace && ./node_modules/.bin/tsc --noEmit --noResolve --noCheck --skipLibCheck --allowJs --jsx preserve --module esnext --target es2022 --moduleResolution bundler '${path}' 2>&1 | head -20`;
}

// Observed in production (self-hosted Docker Desktop for Mac): the container's
// `/workspace/node_modules` symlink into the shared golden-template package cache
// occasionally starts returning EACCES from `stat()` on the symlink target — even for
// root, even right after the container is (re)created — which is a host filesystem
// quirk, not an application bug. It breaks every syntax check in that container until the
// symlink entry itself is deleted and recreated. Detect that exact signature so the caller
// can self-heal instead of surfacing a scary Node stack trace as if it were a real syntax
// error.
export function isWorkspaceNodeModulesAccessError(output: string): boolean {
  return /EACCES.*stat.*['"]\/workspace\/node_modules['"]/.test(output);
}

// Recreates the node_modules symlink in place. Cheap, idempotent, and — per production
// observation — reliably clears the stat() failure above without needing to recreate the
// whole container.
export const WORKSPACE_NODE_MODULES_REPAIR_COMMAND =
  "rm -f /workspace/node_modules && ln -s /opt/evcp-template/node_modules /workspace/node_modules";

// Round-final evaluation: imports are checked ONLY after the whole round's files landed,
// so "page.tsx imports a component created later in the same artifact" never false-positives
// (that false alarm once made the model rebuild a healthy 767-line app from scratch).
export async function collectRoundIssues(
  deps: { checkFileSyntax?: (containerId: string, path: string) => Promise<string> },
  containerId: string,
  writes: Array<{ path: string; content: string }>,
  knownPaths: Set<string>
): Promise<string[]> {
  const issues: string[] = [];
  for (const written of writes) {
    issues.push(...(await collectWriteIssues(deps, containerId, written, knownPaths)));
  }
  return issues;
}

export async function collectWriteIssues(
  deps: { checkFileSyntax?: (containerId: string, path: string) => Promise<string> },
  containerId: string,
  written: { path: string; content: string },
  knownPaths: Set<string>
): Promise<string[]> {
  const issues: string[] = [];
  if (deps.checkFileSyntax) {
    const syntaxOutput = (await deps.checkFileSyntax(containerId, written.path).catch(() => ""))
      .split("\n")
      .filter((line) => !/error TS2307:/.test(line))
      .join("\n")
      .trim();
    if (syntaxOutput) issues.push(`Syntax check failed for ${written.path}:\n${syntaxOutput}`);
  }
  for (const missing of findMissingImports(written.path, written.content, knownPaths)) {
    issues.push(
      `${written.path} imports "${missing}" but no such file exists in the project — create it in the SAME artifact or fix the import path.`
    );
  }
  return issues;
}

export function assertFileLimits(
  files: Array<{ path: string; content: string }>,
  maxFileBytes: number
): void {
  const oversized = files.find((file) => Buffer.byteLength(file.content, "utf8") > maxFileBytes);
  if (oversized) throw new Error(`workspace file '${oversized.path}' exceeds the file-size limit`);
}

// Reads back whatever the round just wrote (post-write, so it sees the container's real
// state) and runs both checks above against it — the single entry point runLockedTurn calls
// after a mutation round to decide whether to feed the model retry guidance.
export async function collectPiWriteIssues(
  deps: PiGenerationServiceDeps,
  containerId: string,
  writtenPaths: Set<string>,
  limits: PiAgentLimits
): Promise<string[]> {
  if (!writtenPaths.size || !deps.readWorkspaceFiles) return [];
  const files = filterAgentWorkspaceFiles(await deps.readWorkspaceFiles(containerId));
  assertFileLimits(files, limits.maxFileBytes);
  const knownPaths = new Set(files.map((file) => file.path));
  const writes = files.filter((file) => writtenPaths.has(file.path));
  return collectRoundIssues(deps, containerId, writes, knownPaths);
}
