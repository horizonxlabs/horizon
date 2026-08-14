import { createHash } from "node:crypto";

// Error tags normalize every detected problem (failed action, build error, runtime 500,
// browser relay report) for the user-controlled Bug Report box.

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

// Files the model does not own: locked files plus everything the template ships under its
// managed roots. Errors here are platform bugs; the classification is audited so the team
// sees template defects instead of blaming the generated app.
const PLATFORM_ROOTS = [
  "components/ui/",
  "lib/mock-data",
  "lib/utils",
  "app/layout",
  "app/globals"
];

export function isPlatformFile(file: string, lockedFiles: string[]): boolean {
  if (lockedFiles.includes(file)) return true;
  return PLATFORM_ROOTS.some((root) => file.startsWith(root));
}
