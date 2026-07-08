import type { WorkspaceDeployment, DeploymentHealthStatus, EnvironmentName } from "@evcp/types";

export interface DeploymentStore {
  create(input: {
    projectId: string;
    slug: string;
    environment: EnvironmentName;
    commitSha: string;
    imageTag: string;
    containerId: string | null;
    publishedByUserId: string;
  }): WorkspaceDeployment;
  updateHealth(id: string, healthStatus: DeploymentHealthStatus): WorkspaceDeployment;
  list(projectId: string): WorkspaceDeployment[];
  getCurrent(slug: string): WorkspaceDeployment | null;
}

export function createMemoryDeploymentStore(): DeploymentStore {
  const byId = new Map<string, WorkspaceDeployment>();
  const order: string[] = [];
  let counter = 0;

  return {
    create(input) {
      counter += 1;
      const deployment: WorkspaceDeployment = {
        id: `dep-${counter}`,
        projectId: input.projectId,
        slug: input.slug,
        environment: input.environment,
        commitSha: input.commitSha,
        imageTag: input.imageTag,
        containerId: input.containerId,
        publishedByUserId: input.publishedByUserId,
        healthStatus: "pending",
        createdAt: new Date().toISOString()
      };
      byId.set(deployment.id, deployment);
      order.push(deployment.id);
      return deployment;
    },
    updateHealth(id, healthStatus) {
      const existing = byId.get(id);
      if (!existing) {
        throw new Error(`unknown deployment '${id}'`);
      }
      const next = { ...existing, healthStatus };
      byId.set(id, next);
      return next;
    },
    list(projectId) {
      return order
        .map((id) => byId.get(id)!)
        .filter((dep) => dep.projectId === projectId)
        .reverse();
    },
    getCurrent(slug) {
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const dep = byId.get(order[i])!;
        if (dep.slug === slug && dep.healthStatus === "healthy") {
          return dep;
        }
      }
      return null;
    }
  };
}
