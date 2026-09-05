import { randomUUID } from "node:crypto";
import type { WorkspaceRuntimeSnapshot } from "../persistence/workspace-runtime-repository";
import type { WorkspaceWarmPoolOptions } from "./warm-pool";
import { resourceKeyForProject } from "./resource-ports";
import {
  maintainWorkspaceCleanupProjectLease,
  WorkspaceCleanupProjectLeaseLostError
} from "./warm-pool-operation-lease";
import { waitForPreviewReady, workspaceSecretEntries } from "./workspace-lifecycle";

/** Recover crash-completed handoffs before reconciliation can release their physical resources. */
export async function recoverStartupWarmClaims(
  options: WorkspaceWarmPoolOptions & { now: () => Date; operationLeaseMs: number }
): Promise<WorkspaceRuntimeSnapshot[]> {
  const runtimeRecords = options.deps.runtimeRecords;
  const leases = runtimeRecords?.provisioningLeases;
  if (!runtimeRecords || !leases) return [];
  const recovered: WorkspaceRuntimeSnapshot[] = [];
  for (const observed of await options.store.list()) {
    const projectId = observed.claimProjectId;
    if (observed.state !== "claiming" || !projectId) continue;
    const token = (options.createOperationOwner ?? randomUUID)();
    if ((await leases.acquire(projectId, token, options.operationLeaseMs)) !== "acquired") continue;
    const ownership = maintainWorkspaceCleanupProjectLease({
      leases,
      projectId,
      token,
      leaseMs: options.operationLeaseMs
    });
    try {
      const existing = (await runtimeRecords.list()).find(
        ({ record }) => record.projectId === projectId
      );
      if (existing) {
        recovered.push(existing);
        continue;
      }
      const slot = (await options.store.list()).find(({ id }) => id === observed.id);
      if (
        slot?.state !== "claiming" ||
        slot.claimProjectId !== projectId ||
        !slot.secretPayload ||
        !slot.llmGatewayKeyId
      )
        continue;
      const logicalKey = resourceKeyForProject(projectId);
      const found = await options.deps.docker.inspectContainer(`evcp-ws-${logicalKey}`);
      if (!found?.running) continue;
      const env = Object.fromEntries(workspaceSecretEntries(found.env));
      let prepared: Record<string, string>;
      try {
        prepared = options.codec.open(slot.secretPayload);
      } catch {
        // A corrupt allocation cannot establish the final container's ownership.
        continue;
      }
      if (
        ["DATABASE_URL", "S3_BUCKET", "LLM_GATEWAY_KEY"].some((name) => !prepared[name]) ||
        !Object.entries(prepared).every(([name, value]) => env[name] === value)
      )
        continue;
      try {
        await waitForPreviewReady(options.deps.docker, found.containerId);
      } catch {
        continue;
      }
      await ownership.assertOwned();
      await options.deps.secrets.replaceForProvisioning(projectId, env, {
        token,
        assertOwned: ownership.assertOwned
      });
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
      if (!(await leases.save(snapshot, token, options.operationLeaseMs)))
        throw new WorkspaceCleanupProjectLeaseLostError();
      recovered.push(snapshot);
      // Reconciliation retires the slot under its own project + slot fences, after this save.
      // Persistence/ownership failures propagate: startup must not mistake them for absence.
    } finally {
      ownership.stop();
      await leases.release(projectId, token).catch(() => undefined);
    }
  }
  return recovered;
}
