import type { WorkspaceDeployment } from "@evcp/types";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { DeploymentStore } from "./deployment-store";

export async function compensateDeploymentCandidate(input: {
  deployments: DeploymentStore;
  docker: DockerEngine;
  deployment?: WorkspaceDeployment;
  flushed: boolean;
  containerId?: string;
  imageIdOrTag: string;
  cause: unknown;
}): Promise<never> {
  const failures: unknown[] = [input.cause];
  if (input.containerId) {
    try { await input.docker.stopContainer(input.containerId); } catch (error) { failures.push(error); }
    try { await input.docker.removeContainer(input.containerId); } catch (error) { failures.push(error); }
  }
  try {
    if (!input.docker.removeImage) throw new Error("Docker image cleanup is unavailable");
    await input.docker.removeImage(input.imageIdOrTag);
  } catch (error) {
    failures.push(error);
  }
  // Keep the durable identity when external cleanup is incomplete so deletion can retry it.
  if (failures.length > 1) throw new AggregateError(failures, "Deployment compensation failed");
  try {
    if (input.deployment && input.flushed) {
      if (input.deployments.remove) input.deployments.remove(input.deployment.id);
      else input.deployments.updateHealth(input.deployment.id, "failed");
      await input.deployments.flush?.();
    } else if (input.deployment) input.deployments.discard(input.deployment.id);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 1) throw new AggregateError(failures, "Deployment compensation failed");
  throw input.cause;
}

export async function cleanupFailedDeploymentContainer(
  docker: DockerEngine,
  containerId: string
): Promise<void> {
  const failures: unknown[] = [];
  try { await docker.stopContainer(containerId); } catch (error) { failures.push(error); }
  try { await docker.removeContainer(containerId); } catch (error) { failures.push(error); }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed deployment container cleanup did not finish");
  }
}

export async function removeDeploymentImage(
  docker: DockerEngine,
  deployment: WorkspaceDeployment
): Promise<void> {
  if (!docker.removeImage) throw new Error("Docker image cleanup is unavailable");
  await docker.removeImage(deployment.imageTag);
}
