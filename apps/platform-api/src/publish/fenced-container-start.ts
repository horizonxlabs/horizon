import type { ProjectMutationFence } from "../project-lifecycle";
import type { DevContainerSpec, DockerEngine } from "../workspace-orchestrator/docker-engine";

export async function createAndStartFencedContainer(input: {
  docker: DockerEngine;
  spec: DevContainerSpec;
  fence?: ProjectMutationFence;
}): Promise<string> {
  await input.fence?.assertCurrent();
  const { containerId } = await input.docker.createContainer(input.spec);
  try {
    await input.fence?.assertCurrent();
    await input.docker.startContainer(containerId);
    await input.fence?.assertCurrent();
    return containerId;
  } catch (error) {
    await input.docker.stopContainer(containerId).catch(() => undefined);
    await input.docker.removeContainer(containerId).catch(() => undefined);
    throw error;
  }
}
