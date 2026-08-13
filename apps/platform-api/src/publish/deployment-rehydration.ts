import type { EnvironmentName, WorkspaceDeployment } from "@evcp/types";
import type { DeploymentStore } from "./deployment-store";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { HealthChecker } from "./health-checker";

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
  health: HealthChecker;
  slug: string;
  environment: EnvironmentName;
}): Promise<WorkspaceDeployment | null> {
  const existing = input.deployments.getCurrent(input.slug, input.environment);
  const containerName = existing?.containerName ?? `evcp-${input.environment}-${input.slug}`;
  const inspected = await input.docker.inspectContainer(containerName);
  if (
    !inspected?.running ||
    !inspected.image ||
    inspected.labels["evcp.managed"] !== "true" ||
    inspected.labels["evcp.project-slug"] !== input.slug ||
    inspected.labels["evcp.env"] !== input.environment
  ) {
    if (existing) {
      input.deployments.updateHealth(existing.id, "failed");
      await input.deployments.flush?.();
    }
    return null;
  }

  const basePath =
    input.environment === "staging" ? `/apps/${input.slug}/staging` : `/apps/${input.slug}`;
  if (!(await input.health.check(`http://${containerName}:3000${basePath}/api/health`))) {
    if (existing) {
      input.deployments.updateHealth(existing.id, "failed");
      await input.deployments.flush?.();
    }
    return null;
  }
  if (existing) return existing;

  const deployment = input.deployments.create({
    // Older running containers do not carry a project id. Do not reverse the resource key: its
    // underscore → hyphen normalization is intentionally lossy. A recovered marker keeps this
    // routing-only record from ever becoming an authority for membership or control-plane state.
    projectId: inspected.labels["evcp.project-id"] || `recovered:${input.slug}`,
    slug: input.slug,
    environment: input.environment,
    commitSha: commitFromImageTag(inspected.image),
    imageTag: inspected.image,
    imageDigest: inspected.image,
    containerId: inspected.containerId,
    containerName,
    publishedByUserId: "system-rehydration"
  });
  const healthy = input.deployments.updateHealth(deployment.id, "healthy");
  await input.deployments.flush?.();
  return healthy;
}
