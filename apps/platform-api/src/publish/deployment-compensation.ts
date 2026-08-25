import type { WorkspaceDeployment } from "@evcp/types";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { DeploymentStore } from "./deployment-store";

export async function compensateDeploymentCandidate(input: {
  deployments: DeploymentStore;
  docker: DockerEngine;
  deployment?: WorkspaceDeployment;
  finalized: boolean;
  flushed: boolean;
  containerId: string;
  cause: unknown;
}): Promise<never> {
  const failures: unknown[] = [input.cause];
  try {
    if (input.deployment && input.finalized && input.flushed) {
      if (input.deployments.remove) input.deployments.remove(input.deployment.id);
      else input.deployments.updateHealth(input.deployment.id, "failed");
      await input.deployments.flush?.();
    } else if (input.deployment) input.deployments.discard(input.deployment.id);
  } catch (error) {
    failures.push(error);
  }
  try { await input.docker.stopContainer(input.containerId); } catch (error) { failures.push(error); }
  try { await input.docker.removeContainer(input.containerId); } catch (error) { failures.push(error); }
  if (failures.length > 1) throw new AggregateError(failures, "Deployment compensation failed");
  throw input.cause;
}
