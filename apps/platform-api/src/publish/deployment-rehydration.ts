import type { EnvironmentName, WorkspaceDeployment } from "@evcp/types";
import type { DeploymentStore } from "./deployment-store";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

function commitFromImageTag(image: string): string {
  const separator = image.lastIndexOf(":");
  return separator >= 0 ? image.slice(separator + 1) : "rehydrated";
}

/**
 * Restores the in-memory routing record after an API restart. The container name is calculated
 * from the immutable resource key and the inspected labels must agree, preventing a route from
 * adopting an arbitrary running container.
 */
export async function rehydrateRunningDeployment(input: {
  deployments: DeploymentStore;
  docker: Pick<DockerEngine, "inspectContainer">;
  slug: string;
  environment: EnvironmentName;
}): Promise<WorkspaceDeployment | null> {
  const existing = input.deployments.getCurrent(input.slug, input.environment);
  if (existing) return existing;

  const inspected = await input.docker.inspectContainer(`evcp-${input.environment}-${input.slug}`);
  if (
    !inspected?.running ||
    !inspected.image ||
    inspected.labels["evcp.managed"] !== "true" ||
    inspected.labels["evcp.project-slug"] !== input.slug ||
    inspected.labels["evcp.env"] !== input.environment
  ) {
    return null;
  }

  const deployment = input.deployments.create({
    // Older running containers do not carry a project id. Do not reverse the resource key: its
    // underscore → hyphen normalization is intentionally lossy. A recovered marker keeps this
    // routing-only record from ever becoming an authority for membership or control-plane state.
    projectId: inspected.labels["evcp.project-id"] || `recovered:${input.slug}`,
    slug: input.slug,
    environment: input.environment,
    commitSha: commitFromImageTag(inspected.image),
    imageTag: inspected.image,
    containerId: inspected.containerId,
    publishedByUserId: "system-rehydration"
  });
  return input.deployments.updateHealth(deployment.id, "healthy");
}
