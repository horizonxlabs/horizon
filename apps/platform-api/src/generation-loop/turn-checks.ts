import { buildErrorFeedback, validateBuild } from "./generation-stream-helpers";

// In-turn write checks (detection layer 1): catch syntax errors and broken local imports
// the moment a file lands — the model fixes them in the SAME turn via the round-retry
// feedback, long before the full build validation (and before the user sees anything).

const IMPORT_PATTERN = /import\s[^'"]*['"]([^'"]+)['"]/g;
const SAFE_PATH = /^[\w@./-]+$/;

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

// Single-file, resolution-free tsc: pure syntax + local semantics in ~1-2s. Module
// resolution stays the build validator's job (this must never false-positive on aliases).
export function buildSyntaxCheckCommand(path: string): string {
  if (!SAFE_PATH.test(path)) throw new Error(`unsafe workspace path: ${path}`);
  return `cd /workspace && ./node_modules/.bin/tsc --noEmit --noResolve --skipLibCheck --allowJs --jsx preserve --module esnext --target es2022 --moduleResolution bundler '${path}' 2>&1 | head -20`;
}

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

// Interim (mid-turn) bug scanning — FOLLOW-UP builds only: per-round write checks plus the
// build self-heal loop. The FIRST build skips this entirely (the user's rule: no bug checks
// while the code is still being written — they were pure process noise on large fresh
// generations); it compiles ONCE at code-complete and reports findings to the Bug box.
// Error-message prefixes here are pinned by tests/unit/self-debug-loop.test.mjs — the Bug
// box classifier (error-tags.ts compileErrorFromTurn) matches them verbatim.
export async function runInterimChecks(
  deps: {
    checkFileSyntax?: (containerId: string, path: string) => Promise<string>;
    workspaceGuard: { validate(projectId: string): Promise<void> };
  },
  containerId: string,
  projectId: string,
  round: {
    roundWrites: Array<{ path: string; content: string }>;
    knownPaths: Set<string>;
    roundHadFileAction: boolean;
    finalRound: boolean;
  }
): Promise<{ feedbackPrompt?: string; errorMessage?: string; validated?: boolean }> {
  if (round.roundWrites.length > 0) {
    const issues = await collectRoundIssues(deps, containerId, round.roundWrites, round.knownPaths);
    if (issues.length > 0) {
      return round.finalRound
        ? { errorMessage: `Write checks still failing: ${issues[0].slice(0, 300)}` }
        : { feedbackPrompt: buildErrorFeedback(issues.join("\n\n")) };
    }
  }
  if (!round.roundHadFileAction) return {};
  const buildError = await validateBuild(deps.workspaceGuard, projectId);
  if (!buildError) return { validated: true };
  return round.finalRound
    ? { errorMessage: `Build still failing after fixes: ${buildError.replace(/\[[0-9;]*m/g, "").slice(0, 300)}` }
    : { feedbackPrompt: buildErrorFeedback(buildError) };
}

export async function collectWriteIssues(
  deps: { checkFileSyntax?: (containerId: string, path: string) => Promise<string> },
  containerId: string,
  written: { path: string; content: string },
  knownPaths: Set<string>
): Promise<string[]> {
  const issues: string[] = [];
  if (deps.checkFileSyntax) {
    const syntaxOutput = (await deps.checkFileSyntax(containerId, written.path).catch(() => "")).trim();
    if (syntaxOutput) issues.push(`Syntax check failed for ${written.path}:\n${syntaxOutput}`);
  }
  for (const missing of findMissingImports(written.path, written.content, knownPaths)) {
    issues.push(
      `${written.path} imports "${missing}" but no such file exists in the project — create it in the SAME artifact or fix the import path.`
    );
  }
  return issues;
}
