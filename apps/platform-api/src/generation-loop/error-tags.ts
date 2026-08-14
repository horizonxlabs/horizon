import { createHash } from "node:crypto";

// Self-debug error tags: every detected problem (failed action, build error, runtime 500,
// browser relay report) becomes a signed tag. The signature is the loop-safety anchor —
// each signature earns exactly ONE automatic debug turn, ever; repeats go back to the user.

export type ErrorTagSource = "action" | "build" | "runtime" | "relay";

export type ErrorTag = {
  signature: string;
  source: ErrorTagSource;
  file?: string;
  message: string;
  platformBug?: boolean;
};

export const AUTO_DEBUG_PREFIX = "[AUTO-DEBUG]";

export function createErrorTag(source: ErrorTagSource, message: string, file?: string): ErrorTag {
  const firstLine = message.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 200);
  const signature = createHash("sha256")
    .update(`${source}|${file ?? ""}|${firstLine}`)
    .digest("hex")
    .slice(0, 16);
  return { signature, source, ...(file ? { file } : {}), message: message.slice(0, 1200) };
}

// Files the model does not own: locked files plus everything the template ships under its
// managed roots. Errors here are platform bugs — the debug turn may fix them, and the
// classification is audited so the team sees template defects instead of blaming the model.
const PLATFORM_ROOTS = ["components/ui/", "lib/mock-data", "lib/utils", "app/layout", "app/globals"];

export function isPlatformFile(file: string, lockedFiles: string[]): boolean {
  if (lockedFiles.includes(file)) return true;
  return PLATFORM_ROOTS.some((root) => file.startsWith(root));
}

export function buildDebugPrompt(
  tags: ErrorTag[],
  options: { previousTurnRolledBack: boolean }
): string {
  const list = tags
    .map((tag, index) => `${index + 1}. [${tag.source}${tag.file ? ` · ${tag.file}` : ""}] ${tag.message}`)
    .join("\n");
  const rolledBackNote = options.previousTurnRolledBack
    ? "\nNote: the previous attempt failed validation and was rolled back — its files are GONE. Re-apply the intended change while avoiding the error above."
    : "";
  return `${AUTO_DEBUG_PREFIX} The platform detected the following errors in the app. Fix ONLY these errors — do not add features, do not restyle, do not touch unrelated code. If an error points at a template file you normally must not recreate, you MAY edit that file to fix it.\n${list}${rolledBackNote}`;
}

export function createTagMemory() {
  const attempted = new Map<string, Set<string>>();
  return {
    filterNew(projectId: string, tags: ErrorTag[]): ErrorTag[] {
      const seen = attempted.get(projectId);
      const unique = new Map(tags.map((tag) => [tag.signature, tag]));
      return [...unique.values()].filter((tag) => !seen?.has(tag.signature));
    },
    markAttempted(projectId: string, tags: ErrorTag[]): void {
      const seen = attempted.get(projectId) ?? new Set<string>();
      for (const tag of tags) seen.add(tag.signature);
      attempted.set(projectId, seen);
    }
  };
}
