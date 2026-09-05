import type { WarmWorkspaceSlot } from "./warm-pool-types";

const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export function retryDelayMs(failureCount: number): number {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, failureCount - 1), MAX_RETRY_DELAY_MS);
}

export function preparationErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/preview|readiness|health/.test(message)) return "preview_unhealthy";
  if (/docker|container|volume/.test(message)) return "container_error";
  if (/postgres|schema|database/.test(message)) return "postgres_error";
  if (/bucket|minio|object|storage|s3/.test(message)) return "object_storage_error";
  if (/llm|gateway|key/.test(message)) return "llm_gateway_error";
  if (/secret|credential|envelope/.test(message)) return "credential_error";
  return "preparation_error";
}

export function isWarmSlotRetryable(slot: WarmWorkspaceSlot, now: Date): boolean {
  const retryDue = slot.retryAfter !== null && new Date(slot.retryAfter).getTime() <= now.getTime();
  if (slot.state === "failed") return retryDue;
  // Restart clears the schedule; failure history identifies the durable retry lineage.
  // Its next owner may take over only once the in-progress operation has expired.
  return (
    (slot.state === "preparing" || slot.state === "cleaning") &&
    slot.failureCount > 0 &&
    (slot.operationExpiresAt === null ||
      new Date(slot.operationExpiresAt).getTime() <= now.getTime())
  );
}
