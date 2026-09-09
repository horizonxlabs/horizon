import { safeToolError } from "./pi-tool-policy";
import type { HorizonPiToolDetails } from "./pi-tools";

export function buildValidationFeedback(error: unknown): string {
  const message = safeToolError(error)
    .replaceAll(String.fromCodePoint(27), "")
    .replace(/\[[0-9;]*m/g, "")
    .slice(0, 4_000);
  return `Validation failed. Fix only these errors with Horizon tools, then stop:\n${message}`;
}

export function buildWriteFeedback(issues: string[]): string {
  return `The files were saved, but Horizon detected these write issues. Repair only these issues in place; do not recreate working files:\n${issues.join("\n")}`;
}

export function ensureNoFailedTool(details: HorizonPiToolDetails | undefined): void {
  if (details) throw new Error(details.error ?? `${details.label} failed`);
}

// A model can see a tool failure in its own conversation and still stop instead of
// self-correcting (e.g. narrate success and move on). This feeds the failure back
// explicitly — same shape as buildWriteFeedback/buildValidationFeedback — so it gets
// one more round to route around it before the whole turn (including everything it DID
// write successfully) is thrown away.
export function buildToolFailureFeedback(details: HorizonPiToolDetails): string {
  const message = safeToolError(details.error ?? `${details.label} failed`);
  return (
    `The "${details.label}" action failed: ${message}\n` +
    "Fix or work around this with the correct Horizon tool before finishing " +
    "using the preinstalled dependencies. Dependency install/add commands and direct package.json " +
    "writes are unavailable. Do not repeat the exact same failing action unchanged."
  );
}
