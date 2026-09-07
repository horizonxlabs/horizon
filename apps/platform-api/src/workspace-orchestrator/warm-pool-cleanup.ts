import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import { workspaceVolumeName } from "./workspace-lifecycle";
import { physicalResourceKey } from "./warm-pool-config";

export async function cleanupWarmSlotResources(
  deps: WorkspaceOrchestratorDeps,
  slot: WarmWorkspaceSlot,
  assertOwned?: () => Promise<void>
): Promise<void> {
  await assertOwned?.();
  const assigned = ((await deps.runtimeRecords?.list()) ?? []).some(
    ({ record }) => physicalResourceKey(record) === slot.resourceKey
  );
  await assertOwned?.();
  if (assigned) return;
  const container = await deps.docker.inspectContainer(`evcp-ws-${slot.resourceKey}`);
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
}
