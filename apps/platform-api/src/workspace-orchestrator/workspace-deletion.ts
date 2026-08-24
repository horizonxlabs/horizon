import type { WorkspaceContainerRecord } from "@evcp/types";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";
import { resourceKeyForProject } from "./resource-ports";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import { workspaceVolumeName } from "./workspace-lifecycle";

export async function deleteWorkspaceResources(input: {
  record: WorkspaceContainerRecord;
  deps: WorkspaceOrchestratorDeps;
  llmGatewayKeyId?: string;
  runtimeRecords?: WorkspaceRuntimeRecordStore;
}): Promise<void> {
  const { record, deps } = input;
  const releaseKey = resourceKeyForProject(record.projectId);
  const failures: Error[] = [];
  const attempt = async (release: () => Promise<void>): Promise<void> => {
    try {
      await release();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  };

  let container: Awaited<ReturnType<typeof deps.docker.inspectContainer>> | undefined;
  await attempt(async () => {
    container = await deps.docker.inspectContainer(`evcp-ws-${releaseKey}`);
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
