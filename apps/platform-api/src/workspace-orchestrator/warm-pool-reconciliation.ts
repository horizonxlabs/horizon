import { randomUUID } from "node:crypto";
import type {
  WarmSlotOperationLease,
  WarmWorkspaceSlot,
  WorkspaceWarmSlotStore
} from "./warm-pool-types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import { physicalResourceKey } from "./warm-pool-config";
import type { WarmPoolSecretCodec } from "./warm-pool-secret-codec";
import { recoverOwnedWarmClaim, type WarmRecoveryPublisher } from "./warm-pool-startup-recovery";
import { waitForPreviewReady } from "./workspace-lifecycle";
import { repairOwnedWarmSecrets } from "./warm-pool-owned-repair";
import {
  maintainWorkspaceCleanupProjectLease,
  withMaintainedWarmSlotOperationLease
} from "./warm-pool-operation-lease";

export async function reconcileWorkspaceWarmPool(options: {
  store: WorkspaceWarmSlotStore;
  deps: WorkspaceOrchestratorDeps;
  codec: WarmPoolSecretCodec;
  targetSize: number;
  now: () => Date;
  operationLeaseMs: number;
  createOperationOwner?: () => string;
  publishRecovered?: WarmRecoveryPublisher;
  cleanupSlotResources: (
    slot: WarmWorkspaceSlot,
    assertOwned?: () => Promise<void>
  ) => Promise<void>;
  retryDelayMs: (failureCount: number) => number;
}): Promise<void> {
  const containers = await options.deps.docker.listManagedContainers();
  let runtimeKeys = await durableRuntimeKeys(options.deps);
  const slots = await options.store.list();
  const totals = { preserved: 0, retired: 0, cleaned: 0, cleanupFailed: 0, staleImage: 0 };
  for (const slot of slots) {
    if (
      options.targetSize > 0 &&
      (slot.state === "failed" ||
        (slot.state === "preparing" && slot.failureCount > 0) ||
        (slot.state === "cleaning" && slot.failureCount > 0))
    ) {
      totals.preserved += 1;
      continue;
    }
    const container = containers.find(
      (candidate) =>
        candidate.name === `evcp-ws-${slot.resourceKey}` &&
        candidate.labels["evcp.kind"] === "workspace-warm" &&
        candidate.labels["evcp.warm-slot-id"] === slot.id
    );
    const unclaimed = slot.state === "ready" || slot.state === "preparing";
    const inspected =
      unclaimed && container ? await options.deps.docker.inspectContainer(container.name) : null;
    const staleImage = Boolean(
      inspected && inspected.image !== (options.deps.image ?? "evcp/workspace-next:1")
    );
    if (staleImage) totals.staleImage += 1;
    // Durable allocations are no longer pool capacity to recycle, even after a release changes.
    if (unclaimed && runtimeKeys.has(slot.resourceKey)) {
      totals.preserved += 1;
      continue;
    }
    if (
      options.targetSize > 0 &&
      !runtimeKeys.has(slot.resourceKey) &&
      slot.state === "ready" &&
      !staleImage &&
      container?.running
    ) {
      try {
        await waitForPreviewReady(options.deps.docker, container.containerId);
        totals.preserved += 1;
        continue;
      } catch {
        // A running container is only reusable when the preview is healthy.
      }
    }
    const ownerId = (options.createOperationOwner ?? randomUUID)();
    const projectLeases = slot.claimProjectId
      ? options.deps.runtimeRecords?.provisioningLeases
      : undefined;
    if (slot.claimProjectId && !projectLeases) {
      totals.preserved += 1;
      continue;
    }
    const projectLeaseAcquisition =
      slot.claimProjectId && projectLeases
        ? await projectLeases.acquire(slot.claimProjectId, ownerId, options.operationLeaseMs)
        : undefined;
    if (projectLeaseAcquisition === "contended" || projectLeaseAcquisition === "deleting_project") {
      totals.preserved += 1;
      continue;
    }
    const projectOwnership =
      slot.claimProjectId && projectLeases && projectLeaseAcquisition === "acquired"
        ? maintainWorkspaceCleanupProjectLease({
            leases: projectLeases,
            projectId: slot.claimProjectId,
            token: ownerId,
            leaseMs: options.operationLeaseMs
          })
        : undefined;
    try {
      if (projectOwnership) {
        const current = (await options.store.list()).find(({ id }) => id === slot.id);
        if (
          !current ||
          current.resourceKey !== slot.resourceKey ||
          current.claimProjectId !== slot.claimProjectId ||
          current.state !== slot.state
        ) {
          totals.preserved += 1;
          continue;
        }
        const recovery = await recoverOwnedWarmClaim(
          options,
          current,
          { token: ownerId, assertOwned: projectOwnership.assertOwned },
          options.publishRecovered
        );
        if (recovery === "preserve") {
          totals.preserved += 1;
          continue;
        }
      }
      const acquired = await options.store.acquireCleanup(
        slot.id,
        slot,
        operationLease(options, ownerId)
      );
      if (!acquired) {
        totals.preserved += 1;
        continue;
      }
      await withMaintainedWarmSlotOperationLease(
        {
          store: options.store,
          slotId: acquired.id,
          ownerId,
          now: options.now,
          leaseMs: options.operationLeaseMs
        },
        async (ownership) => {
          const assertOwned = async () => {
            await projectOwnership?.assertOwned();
            await ownership.assertOwned();
          };
          let ownedSlot = acquired;
          if (container && container.containerId !== acquired.containerId) {
            const updated = await options.store.recordPreparingContainer(
              acquired.id,
              container.containerId,
              operationLease(options, ownerId)
            );
            if (!updated) return;
            ownedSlot = { ...acquired, containerId: container.containerId };
          }

          // Ownership can become durable between the initial inventory and cleanup-CAS acquisition.
          runtimeKeys = await durableRuntimeKeys(options.deps);
          await assertOwned();
          if (runtimeKeys.has(ownedSlot.resourceKey)) {
            if (projectOwnership)
              await repairOwnedWarmSecrets(
                options,
                { ...ownedSlot, state: slot.state },
                {
                  token: ownerId,
                  assertOwned
                }
              );
            await assertOwned();
            await options.store.remove(ownedSlot.id, ownerId);
            totals.retired += 1;
            return;
          }
          try {
            await options.cleanupSlotResources(ownedSlot, assertOwned);
            await options.store.remove(ownedSlot.id, ownerId);
            totals.cleaned += 1;
          } catch {
            totals.cleanupFailed += 1;
            const failureCount = ownedSlot.failureCount + 1;
            await options.store.markFailed(
              ownedSlot.id,
              {
                lastError: "cleanup_error",
                failureCount,
                retryAfter: new Date(
                  options.now().getTime() + options.retryDelayMs(failureCount)
                ).toISOString()
              },
              operationLease(options, ownerId)
            );
          }
        }
      );
    } finally {
      projectOwnership?.stop();
      if (slot.claimProjectId && projectLeases && projectLeaseAcquisition === "acquired") {
        await projectLeases.release(slot.claimProjectId, ownerId).catch(() => undefined);
      }
    }
  }
  try {
    options.deps.onAudit?.({
      action: "workspace.pool_reconciled",
      projectId: "workspace-pool",
      metadata: { ...countSlots(slots, options.targetSize), ...totals }
    });
  } catch {
    // Audit delivery must not invalidate completed reconciliation.
  }
}

async function durableRuntimeKeys(deps: WorkspaceOrchestratorDeps): Promise<Set<string>> {
  return new Set(
    ((await deps.runtimeRecords?.list()) ?? []).map(({ record }) => physicalResourceKey(record))
  );
}

function operationLease(
  options: { now: () => Date; operationLeaseMs: number },
  ownerId: string
): WarmSlotOperationLease {
  const current = options.now();
  return {
    ownerId,
    now: current.toISOString(),
    expiresAt: new Date(current.getTime() + options.operationLeaseMs).toISOString()
  };
}

export function countSlots(slots: WarmWorkspaceSlot[], target: number, staleImage = 0) {
  return {
    target,
    preparing: slots.filter((slot) => slot.state === "preparing").length,
    ready: slots.filter((slot) => slot.state === "ready").length,
    claiming: slots.filter((slot) => slot.state === "claiming").length,
    failed: slots.filter((slot) => slot.state === "failed").length,
    staleImage
  };
}

export async function countStaleWarmImages(
  slots: WarmWorkspaceSlot[],
  deps: WorkspaceOrchestratorDeps
): Promise<number> {
  let stale = 0;
  for (const slot of slots) {
    if (slot.state !== "ready" && slot.state !== "preparing") continue;
    const container = await deps.docker.inspectContainer(`evcp-ws-${slot.resourceKey}`);
    if (container && container.image !== (deps.image ?? "evcp/workspace-next:1")) stale += 1;
  }
  return stale;
}
