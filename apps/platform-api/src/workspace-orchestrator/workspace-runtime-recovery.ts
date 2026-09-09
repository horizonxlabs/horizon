import type { WorkspaceContainerRecord } from "@evcp/types";
import type { DockerEngine } from "./docker-engine";
import { inspectWorkspaceContainer } from "./runtime-location";
import { waitForPreviewReady } from "./workspace-lifecycle";

export async function reuseWorkspaceContainer(
  docker: DockerEngine,
  record: WorkspaceContainerRecord,
  expectedImage: string
): Promise<{ containerId: string; mode: "reattached" | "restarted" } | null> {
  const found = await inspectWorkspaceContainer(docker, record);
  if (found && found.image === expectedImage) {
    try {
      if (!found.running) await docker.startContainer(found.containerId);
      await waitForPreviewReady(docker, found.containerId);
      return { containerId: found.containerId, mode: found.running ? "reattached" : "restarted" };
    } catch {
      // A stopped container can accept start and then exit before the readiness exec is created.
      // Its durable volume is reusable, but its writable runtime layer is disposable.
    }
  }

  if (found) {
    // Re-check identity before removal so a concurrent successor can never be deleted.
    const current = await inspectWorkspaceContainer(docker, record).catch(() => null);
    if (current?.containerId === found.containerId) {
      if (current.running) await docker.stopContainer(current.containerId).catch(() => undefined);
      await docker.removeContainer(current.containerId);
    }
  }
  return null;
}
