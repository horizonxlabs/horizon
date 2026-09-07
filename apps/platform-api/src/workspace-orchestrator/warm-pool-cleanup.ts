import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import { workspaceVolumeName } from "./workspace-lifecycle";
import { physicalResourceKey } from "./warm-pool-config";

export type WarmSlotCleanupOutcome = "cleaned" | "preserved";

export async function cleanupWarmSlotResources(
  deps: WorkspaceOrchestratorDeps,
  slot: WarmWorkspaceSlot,
  assertOwned?: () => Promise<void>
): Promise<WarmSlotCleanupOutcome> {
  await assertOwned?.();
  const assigned = ((await deps.runtimeRecords?.list()) ?? []).some(
    ({ record }) =>
      physicalResourceKey(record) === slot.resourceKey ||
      (slot.containerId && record.containerId === slot.containerId)
  );
  await assertOwned?.();
  if (assigned) return "preserved";
  const container = await deps.docker.inspectContainer(`evcp-ws-${slot.resourceKey}`);
  // Recovery may exit on failed health after another project has durably acquired the container.
  // Reauthorize here, using both physical identities, before any destructive resource operation.
  await assertOwned?.();
  const owners = (await deps.runtimeRecords?.list()) ?? [];
  await assertOwned?.();
  if (owners.some(({ record }) => physicalResourceKey(record) === slot.resourceKey))
    return "preserved";
  if (
    owners.some(
      ({ record }) =>
        record.containerId &&
        (record.containerId === container?.containerId || record.containerId === slot.containerId)
    )
  ) {
    return "preserved";
  }
  const failures: unknown[] = [];
  const cleanup = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  };
  if (container) {
    await assertOwned?.();
    // A live or stopped container still owns its mounts and credentials until removal succeeds.
    await deps.docker.removeContainer(container.containerId);
  }
  await assertOwned?.();
  const operations: Array<() => Promise<void>> = [
    () => deps.postgres.releaseSchema(slot.resourceKey),
    () => deps.objectStorage.releaseBucket(slot.resourceKey),
    () => deps.docker.removeVolume(workspaceVolumeName(slot.resourceKey))
  ];
  if (slot.llmGatewayKeyId) {
    operations.push(() => deps.llmGateway.revokeVirtualKey(slot.llmGatewayKeyId!));
  }
  await Promise.all(operations.map(cleanup));
  if (failures.length > 0) {
    throw new AggregateError(failures, "warm workspace resource cleanup failed");
  }
  return "cleaned";
}
