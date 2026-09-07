import type { DockerEngine } from "./docker-engine";
import { resourceKeyForProject } from "./resource-ports";

export const MANAGED_WORKSPACE_SECRET_NAMES: ReadonlySet<string> = new Set([
  "DATABASE_URL",
  "LLM_GATEWAY_KEY",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY"
]);

export function workspaceSecretEntries(env: readonly string[]): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const item of env) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const name = item.slice(0, separator);
    if (MANAGED_WORKSPACE_SECRET_NAMES.has(name)) entries.push([name, item.slice(separator + 1)]);
  }
  return entries;
}

export function workspaceVolumeName(resourceKey: string): string {
  return `evcp-ws-${resourceKey}-data`;
}

export function workspaceVolumeLabels(projectId: string): Record<string, string> {
  return {
    "evcp.managed": "true",
    "evcp.project-id": projectId,
    "evcp.kind": "workspace-data"
  };
}

export function workspaceWarmResourceLabels(slotId: string): Record<string, string> {
  return {
    "evcp.managed": "true",
    "evcp.kind": "workspace-warm",
    "evcp.warm-slot-id": slotId
  };
}

export function workspaceWarmVolumeLabels(slotId: string): Record<string, string> {
  return workspaceWarmResourceLabels(slotId);
}

export async function waitForPreviewReady(
  docker: Pick<DockerEngine, "execInContainer">,
  containerId: string
): Promise<void> {
  const result = await docker.execInContainer(containerId, [
    "sh",
    "-c",
    'attempt=0; url="http://127.0.0.1:3000${EVCP_PREVIEW_BASE:-}/api/health"; while [ "$attempt" -lt 600 ]; do curl -fsS "$url" >/dev/null 2>&1 && exit 0; attempt=$((attempt + 1)); sleep 0.2; done; exit 1'
  ]);
  if (result.exitCode !== 0) {
    throw new Error("workspace preview readiness timed out after 120 seconds");
  }
}

export type ProjectOrphanCleanup = (
  projectId: string,
  operation: (assertOwned: () => Promise<void>) => Promise<void>
) => Promise<void>;

export async function cleanupOrphanWorkspaceResources(input: {
  docker: DockerEngine;
  activeProjectIds: ReadonlySet<string>;
  activeWarmSlotIds?: ReadonlySet<string>;
  activeResourceKeys?: ReadonlySet<string>;
  isWarmResourceOwned?: (resourceKey: string) => Promise<boolean>;
  cleanupProject?: ProjectOrphanCleanup;
  onRemoved?: (event: { projectId: string; containerName?: string; volumeName?: string }) => void;
}): Promise<string[]> {
  const removed: string[] = [];
  const cleanupProject =
    input.cleanupProject ?? (async (_projectId, operation) => operation(async () => {}));
  const activeResourceKeys = input.activeResourceKeys ?? new Set<string>();
  for (const container of await input.docker.listManagedContainers()) {
    const resourceKey = container.name.match(/^evcp-ws-([a-z0-9-]+)$/)?.[1];
    if (resourceKey && activeResourceKeys.has(resourceKey)) continue;
    if (container.labels["evcp.kind"] === "workspace-warm" && !container.labels["evcp.env"]) {
      if (input.activeWarmSlotIds?.has(container.labels["evcp.warm-slot-id"] ?? "")) continue;
      if (
        !resourceKey ||
        !input.isWarmResourceOwned ||
        (await input.isWarmResourceOwned(resourceKey))
      )
        continue;
      await input.docker.removeContainer(container.containerId);
      removed.push(container.name);
      continue;
    }
    const projectId = container.labels["evcp.project-id"];
    const isDevelopmentWorkspace =
      container.name.startsWith("evcp-ws-") && !container.labels["evcp.env"];
    if (!isDevelopmentWorkspace || !projectId || input.activeProjectIds.has(projectId)) continue;
    await cleanupProject(projectId, async (assertOwned) => {
      await assertOwned();
      const current = await input.docker.inspectContainer(container.name);
      if (!current || current.containerId !== container.containerId) return;
      if (current.running) {
        await assertOwned();
        await input.docker.stopContainer(container.containerId).catch(() => undefined);
      }
      await assertOwned();
      await input.docker.removeContainer(container.containerId);
      removed.push(container.name);
      const volumeName = workspaceVolumeName(resourceKeyForProject(projectId));
      await assertOwned();
      await input.docker.removeVolume(volumeName).catch(() => undefined);
      removed.push(volumeName);
      input.onRemoved?.({ projectId, containerName: container.name, volumeName });
    });
  }
  for (const volume of await input.docker.listManagedVolumes()) {
    const resourceKey = volume.name.match(/^evcp-ws-([a-z0-9-]+)-data$/)?.[1];
    if (resourceKey && activeResourceKeys.has(resourceKey)) continue;
    if (volume.labels["evcp.kind"] === "workspace-warm" && !volume.labels["evcp.env"]) {
      if (input.activeWarmSlotIds?.has(volume.labels["evcp.warm-slot-id"] ?? "")) continue;
      if (
        !resourceKey ||
        !input.isWarmResourceOwned ||
        (await input.isWarmResourceOwned(resourceKey))
      )
        continue;
      await input.docker.removeVolume(volume.name);
      removed.push(volume.name);
      continue;
    }
    const projectId = volume.labels["evcp.project-id"];
    const isDevelopmentWorkspace =
      volume.labels["evcp.kind"] === "workspace-data" && !volume.labels["evcp.env"];
    if (
      !isDevelopmentWorkspace ||
      !projectId ||
      input.activeProjectIds.has(projectId) ||
      removed.includes(volume.name)
    )
      continue;
    await cleanupProject(projectId, async (assertOwned) => {
      await assertOwned();
      await input.docker.removeVolume(volume.name);
      removed.push(volume.name);
      input.onRemoved?.({ projectId, volumeName: volume.name });
    });
  }
  return removed;
}
