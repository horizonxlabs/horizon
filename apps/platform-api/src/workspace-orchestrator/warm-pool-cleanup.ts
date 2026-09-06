import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import { workspaceVolumeName } from "./workspace-lifecycle";
import { resourceKeyForProject } from "./resource-ports";

export async function cleanupWarmSlotResources(
  deps: WorkspaceOrchestratorDeps,
  slot: WarmWorkspaceSlot,
  assertOwned?: () => Promise<void>
): Promise<void> {
  if (slot.claimProjectId) {
    await assertOwned?.();
    const assigned = ((await deps.runtimeRecords?.list()) ?? []).some(
      ({ record }) => record.projectId === slot.claimProjectId
    );
    await assertOwned?.();
    if (!assigned) {
      const final = await deps.docker.inspectContainer(
        `evcp-ws-${resourceKeyForProject(slot.claimProjectId)}`
      );
      if (final) {
        await assertOwned?.();
        // Even a stopped final container pins the warm volume until its reference is removed.
        await deps.docker.removeContainer(final.containerId);
      }
    }
  }
  const failures: unknown[] = [];
  const cleanup = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  };
  if (slot.containerId) {
    await assertOwned?.();
    await cleanup(() => deps.docker.removeContainer(slot.containerId!));
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
}
