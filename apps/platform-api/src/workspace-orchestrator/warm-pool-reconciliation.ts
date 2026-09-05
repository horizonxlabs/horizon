import type { WarmWorkspaceSlot, WorkspaceWarmSlotStore } from "./warm-pool-types";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import { physicalResourceKey } from "./warm-pool-config";
import { waitForPreviewReady } from "./workspace-lifecycle";

export async function reconcileWorkspaceWarmPool(options: {
  store: WorkspaceWarmSlotStore;
  deps: WorkspaceOrchestratorDeps;
  targetSize: number;
  now: () => Date;
  cleanupSlotResources: (slot: WarmWorkspaceSlot) => Promise<void>;
  retryDelayMs: (failureCount: number) => number;
}): Promise<void> {
  const containers = await options.deps.docker.listManagedContainers();
  const runtimeKeys = new Set(
    ((await options.deps.runtimeRecords?.list()) ?? []).map(({ record }) =>
      physicalResourceKey(record)
    )
  );
  const slots = await options.store.list();
  const totals = { preserved: 0, retired: 0, cleaned: 0, cleanupFailed: 0 };
  for (const slot of slots) {
    if (runtimeKeys.has(slot.resourceKey)) {
      await options.store.remove(slot.id);
      totals.retired += 1;
      continue;
    }
    const container = containers.find(
      (candidate) =>
        candidate.labels["evcp.kind"] === "workspace-warm" &&
        candidate.labels["evcp.warm-slot-id"] === slot.id
    );
    if (container && container.containerId !== slot.containerId) {
      await options.store.recordPreparingContainer(slot.id, container.containerId);
    }
    if (slot.state === "ready" && container?.running) {
      try {
        await waitForPreviewReady(options.deps.docker, container.containerId);
        totals.preserved += 1;
        continue;
      } catch {
        // A running container is only reusable when the preview is healthy.
      }
    }
    try {
      await options.cleanupSlotResources({ ...slot, containerId: container?.containerId ?? null });
      await options.store.remove(slot.id);
      totals.cleaned += 1;
    } catch {
      totals.cleanupFailed += 1;
      const failureCount = slot.failureCount + 1;
      await options.store.markFailed(slot.id, {
        lastError: "cleanup_error",
        failureCount,
        retryAfter: new Date(
          options.now().getTime() + options.retryDelayMs(failureCount)
        ).toISOString()
      });
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

export function countSlots(slots: WarmWorkspaceSlot[], target: number) {
  return {
    target,
    preparing: slots.filter((slot) => slot.state === "preparing").length,
    ready: slots.filter((slot) => slot.state === "ready").length,
    claiming: slots.filter((slot) => slot.state === "claiming").length,
    failed: slots.filter((slot) => slot.state === "failed").length
  };
}
