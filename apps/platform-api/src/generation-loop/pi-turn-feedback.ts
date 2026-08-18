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
