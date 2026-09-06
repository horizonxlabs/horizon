import type { WorkspaceRuntimeSnapshot } from "../persistence/workspace-runtime-repository";
import type { WorkspaceWarmPoolOptions } from "./warm-pool";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import type { ProvisioningSecretAttempt } from "./secret-store";
import { resourceKeyForProject } from "./resource-ports";
import { WorkspaceCleanupProjectLeaseLostError } from "./warm-pool-operation-lease";
import { waitForPreviewReady, workspaceSecretEntries } from "./workspace-lifecycle";

/** Capture local state before recovery I/O, then conditionally publish inside the project lease. */
export type WarmRecoveryPublisher = (projectId: string) => {
  publish(snapshot: WorkspaceRuntimeSnapshot): void;
  release(): void;
};

/** Called only inside reconciliation's maintained project lease, before its cleanup decision. */
export async function recoverOwnedWarmClaim(
  options: WorkspaceWarmPoolOptions & { now: () => Date; operationLeaseMs: number },
  slot: WarmWorkspaceSlot,
  ownership: ProvisioningSecretAttempt,
  publishRecovered?: WarmRecoveryPublisher
): Promise<void> {
  const runtimeRecords = options.deps.runtimeRecords;
  const leases = runtimeRecords?.provisioningLeases;
  const projectId = slot.claimProjectId;
  if (!runtimeRecords || !leases || !projectId) return;
  const publication = publishRecovered?.(projectId);
  try {
    const existing = (await runtimeRecords.list()).find(
      ({ record }) => record.projectId === projectId
    );
    if (existing) {
      // Retirement must not overwrite the orchestrator's Docker-hydrated state with stored state.
      return;
    }
    if (slot.state !== "claiming" || !slot.secretPayload || !slot.llmGatewayKeyId) return;
    const logicalKey = resourceKeyForProject(projectId);
    const found = await options.deps.docker.inspectContainer(`evcp-ws-${logicalKey}`);
    if (!found?.running) return;
    const env = Object.fromEntries(workspaceSecretEntries(found.env));
    let prepared: Record<string, string>;
    try {
      prepared = options.codec.open(slot.secretPayload);
    } catch {
      // A corrupt allocation cannot establish the final container's ownership.
      return;
    }
    if (
      ["DATABASE_URL", "S3_BUCKET", "LLM_GATEWAY_KEY"].some((name) => !prepared[name]) ||
      !Object.entries(prepared).every(([name, value]) => env[name] === value)
    )
      return;
    try {
      await waitForPreviewReady(options.deps.docker, found.containerId);
    } catch {
      return;
    }
    await ownership.assertOwned();
    await options.deps.secrets.replaceForProvisioning(projectId, env, ownership);
    const timestamp = options.now().toISOString();
    const snapshot: WorkspaceRuntimeSnapshot = {
      record: {
        id: `ws-${logicalKey}`,
        projectId,
        slug: logicalKey,
        resourceKey: slot.resourceKey,
        state: "running",
        containerId: found.containerId,
        cpuCores: options.deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1),
        memoryMb: options.deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048),
        lastActivityAt: timestamp,
        createdAt: slot.claimedAt ?? timestamp,
        updatedAt: timestamp
      },
      llmGatewayKeyId: slot.llmGatewayKeyId
    };
    if (!(await leases.save(snapshot, ownership.token, options.operationLeaseMs)))
      throw new WorkspaceCleanupProjectLeaseLostError();
    // Keep the durable fence; local CAS also covers a successful renewal's delayed response.
    await ownership.assertOwned();
    publication?.publish(snapshot);
  } finally {
    publication?.release();
  }
}
