import type { WorkspaceRuntimeSnapshot } from "../persistence/workspace-runtime-repository";
import type { WorkspaceWarmPoolOptions } from "./warm-pool";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import type { ProvisioningSecretAttempt } from "./secret-store";
import { resourceKeyForProject } from "./resource-ports";
import { WorkspaceCleanupProjectLeaseLostError } from "./warm-pool-operation-lease";
import { waitForPreviewReady, workspaceSecretEntries } from "./workspace-lifecycle";

/** Called only inside reconciliation's maintained project lease, before its cleanup decision. */
export async function recoverOwnedWarmClaim(
  options: WorkspaceWarmPoolOptions & { now: () => Date; operationLeaseMs: number },
  slot: WarmWorkspaceSlot,
  ownership: ProvisioningSecretAttempt
): Promise<WorkspaceRuntimeSnapshot | null> {
  const runtimeRecords = options.deps.runtimeRecords;
  const leases = runtimeRecords?.provisioningLeases;
  const projectId = slot.claimProjectId;
  if (!runtimeRecords || !leases || !projectId) return null;
  const existing = (await runtimeRecords.list()).find(
    ({ record }) => record.projectId === projectId
  );
  if (existing) {
    // Retirement must not overwrite the orchestrator's Docker-hydrated state with stored state.
    return null;
  }
  if (slot.state !== "claiming" || !slot.secretPayload || !slot.llmGatewayKeyId) return null;
  const logicalKey = resourceKeyForProject(projectId);
  const found = await options.deps.docker.inspectContainer(`evcp-ws-${logicalKey}`);
  if (!found?.running) return null;
  const env = Object.fromEntries(workspaceSecretEntries(found.env));
  let prepared: Record<string, string>;
  try {
    prepared = options.codec.open(slot.secretPayload);
  } catch {
    // A corrupt allocation cannot establish the final container's ownership.
    return null;
  }
  if (
    ["DATABASE_URL", "S3_BUCKET", "LLM_GATEWAY_KEY"].some((name) => !prepared[name]) ||
    !Object.entries(prepared).every(([name, value]) => env[name] === value)
  )
    return null;
  try {
    await waitForPreviewReady(options.deps.docker, found.containerId);
  } catch {
    return null;
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
  return snapshot;
}
