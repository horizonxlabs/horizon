import type { WorkspaceWarmSlotStore } from "./warm-pool-types";
import type { WarmPoolSecretCodec } from "./warm-pool-secret-codec";

export async function recoverWarmClaim(
  options: { store: WorkspaceWarmSlotStore; codec: WarmPoolSecretCodec },
  projectId: string,
  env: Record<string, string>
) {
  const slot = (await options.store.list()).find((item) => item.claimProjectId === projectId);
  if (!slot) return null;
  if (!slot.secretPayload || !slot.llmGatewayKeyId) {
    throw new Error("incomplete warm workspace claim cannot be recovered");
  }
  const prepared = options.codec.open(slot.secretPayload);
  // A prior failed claim may coexist with a cold fallback container for this project.
  // Only the matching prepared credentials establish ownership of the found container.
  if (
    ["DATABASE_URL", "S3_BUCKET", "LLM_GATEWAY_KEY"].some((name) => !prepared[name]) ||
    !Object.entries(prepared).every(([name, value]) => env[name] === value)
  )
    return null;
  if (slot.state !== "claiming") {
    throw new Error("warm workspace claim is unavailable for recovery");
  }
  return { slotId: slot.id, resourceKey: slot.resourceKey, llmGatewayKeyId: slot.llmGatewayKeyId };
}
