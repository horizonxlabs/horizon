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
