import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";
import { physicalResourceKey } from "./warm-pool-config";
import { inspectWorkspaceContainer } from "./runtime-location";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import { workspaceVolumeName } from "./workspace-lifecycle";
import type { ProjectDeletionFence } from "../project-lifecycle";
import type { WorkspaceRuntimeCache } from "./runtime-cache";

export function createWorkspaceDeletion(
  deps: WorkspaceOrchestratorDeps,
  cache: WorkspaceRuntimeCache,
  llmKeyIds: Map<string, string>
) {
  return async (projectId: string, fence?: ProjectDeletionFence): Promise<void> => {
    // Deletion is a local mutation even before recovery has published its durable runtime.
    cache.invalidate(projectId);
    try {
      await fence?.assertCurrent();
      const cached = cache.records.get(projectId);
      const durable =
        cached && !fence?.workspaceToken
          ? undefined
          : (await deps.runtimeRecords?.list())?.find(
              (snapshot) => snapshot.record.projectId === projectId
            );
      await fence?.assertCurrent();
      const record = durable?.record ?? cached;
      if (record)
        await deleteWorkspaceResources({
          record,
          deps,
          llmGatewayKeyId: durable?.llmGatewayKeyId ?? llmKeyIds.get(projectId),
          runtimeRecords: deps.runtimeRecords,
          fence
        });
      if (fence?.workspaceToken)
        await deps.warmPool?.deleteProjectClaims(projectId, () => fence.assertCurrent());
      if (!record && fence?.workspaceToken) {
        await fence.assertCurrent();
        await deps.secrets.removeAll(projectId);
        await fence.assertCurrent();
      }
      cache.delete(projectId);
      llmKeyIds.delete(projectId);
      try {
        deps.onAudit?.({ action: "workspace.deleted", projectId });
      } catch {
        // Completed cleanup remains successful even when audit transport is unavailable.
      }
    } finally {
      // Also reject captures begun during a lookup, an idempotent miss, or a failed cleanup.
      cache.invalidate(projectId);
    }
  };
}

export async function deleteWorkspaceResources(input: {
  record: WorkspaceContainerRecord;
  deps: WorkspaceOrchestratorDeps;
  llmGatewayKeyId?: string;
  runtimeRecords?: WorkspaceRuntimeRecordStore;
  fence?: ProjectDeletionFence;
}): Promise<void> {
  const { record, deps } = input;
  const releaseKey = physicalResourceKey(record);
  const failures: Error[] = [];
  const attempt = async (release: () => Promise<void>): Promise<void> => {
    await input.fence?.assertCurrent();
    try {
      await release();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
    await input.fence?.assertCurrent();
  };

  let container: Awaited<ReturnType<typeof deps.docker.inspectContainer>> | undefined;
  await attempt(async () => {
    container = await inspectWorkspaceContainer(deps.docker, record);
  });
  const containerId =
    container?.containerId ?? (container === undefined ? record.containerId : null);
  if (containerId) {
    await attempt(() => deps.docker.stopContainer(containerId));
    await attempt(() => deps.docker.removeContainer(containerId));
  }
  await attempt(() => deps.docker.removeVolume(workspaceVolumeName(releaseKey)));
  await attempt(() => deps.postgres.releaseSchema(releaseKey));
  await attempt(() => deps.objectStorage.releaseBucket(releaseKey));
  if (input.llmGatewayKeyId) {
    await attempt(() => deps.llmGateway.revokeVirtualKey(input.llmGatewayKeyId!));
  }
  await attempt(() => deps.secrets.removeAll(record.projectId));
  if (failures.length === 0 && input.runtimeRecords) {
    await attempt(() => input.runtimeRecords!.remove(record.projectId));
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Workspace cleanup did not finish for project '${record.projectId}'`
    );
  }
}
