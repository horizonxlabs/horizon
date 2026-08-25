import type { ProjectMutationFence } from "../project-lifecycle";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { TarFile } from "../workspace-orchestrator/tar-inject";

export async function buildFencedImage(input: {
  docker: DockerEngine;
  sourceContainerId: string;
  imageTag: string;
  dockerfilePath: string;
  extraFiles: TarFile[];
  fence?: ProjectMutationFence;
}): Promise<string> {
  await input.fence?.assertCurrent();
  let imageId: string | undefined;
  try {
    const image = await input.docker.buildImage(
      input.sourceContainerId, input.imageTag, input.dockerfilePath, input.extraFiles
    );
    imageId = image.imageId;
    await input.fence?.assertCurrent();
    return imageId;
  } catch (error) {
    try {
      if (!input.docker.removeImage) throw new Error("Docker image cleanup is unavailable");
      await input.docker.removeImage(imageId ?? input.imageTag);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Publish image cleanup failed");
    }
    throw error;
  }
}
