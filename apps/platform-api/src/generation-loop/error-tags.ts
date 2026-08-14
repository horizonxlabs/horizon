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

export function createErrorTag(source: ErrorTagSource, message: string, file?: string): ErrorTag {
  const firstLine = message.split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 200);
  const signature = createHash("sha256")
    .update(`${source}|${file ?? ""}|${firstLine}`)
    .digest("hex")
    .slice(0, 16);
  return { signature, source, ...(file ? { file } : {}), message: message.slice(0, 1200) };
}

// The Bug Report box shows only problems that survive to the END of a turn: post-write
// compile findings (these prefixes) plus the runtime probe. Mid-turn process noise
// ("Action failed after retries...") already streamed into the chat and reads as
// gibberish when repeated as a bug. Wording is duplicated from generation-service
// (its 400-line ratchet blocks a shared import) — pinned by self-debug-loop tests.
const COMPILE_ERROR_PREFIXES = ["Write checks still failing: ", "Build still failing after fixes: "];

export function compileErrorFromTurn(message: string): string | null {
  for (const prefix of COMPILE_ERROR_PREFIXES) {
    if (message.startsWith(prefix)) return message.slice(prefix.length);
  }
  return null;
}

// Files the model does not own: locked files plus everything the template ships under its
// managed roots. Errors here are platform bugs — the debug turn may fix them, and the
// classification is audited so the team sees template defects instead of blaming the model.
const PLATFORM_ROOTS = ["components/ui/", "lib/mock-data", "lib/utils", "app/layout", "app/globals"];

export function isPlatformFile(file: string, lockedFiles: string[]): boolean {
  if (lockedFiles.includes(file)) return true;
  return PLATFORM_ROOTS.some((root) => file.startsWith(root));
}
