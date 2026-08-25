import type { WorkspaceDeployment, DeploymentHealthStatus, EnvironmentName } from "@evcp/types";

export interface DeploymentStore {
  create(input: {
    projectId: string;
    slug: string;
    environment: EnvironmentName;
    commitSha: string;
    imageTag: string;
    imageDigest?: string;
    containerId: string | null;
    containerName?: string;
    publishedByUserId: string;
  }): WorkspaceDeployment;
  updateRuntime(id: string, input: {
    imageDigest?: string;
    containerId?: string | null;
    containerName?: string;
  }): WorkspaceDeployment;
  updateHealth(id: string, healthStatus: DeploymentHealthStatus): WorkspaceDeployment;
  discard(id: string): void;
  remove?(id: string): void;
  removeProject(projectId: string): void;
  list(projectId: string): WorkspaceDeployment[];
  // Latest healthy deployment for a slug in a given environment. Defaults to "production" so the
  // /apps serve path and existing callers get the live production tier. Env-awareness matters:
  // staging and production deploy to the same slug, and the caller must resolve the right tier.
  getCurrent(slug: string, environment?: EnvironmentName): WorkspaceDeployment | null;
  flush?(): Promise<void>;
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
        imageDigest: input.imageDigest ?? input.imageTag,
        containerId: input.containerId,
        containerName: input.containerName ?? `evcp-${input.environment}-${input.slug}`,
        revision:
          order
            .map((id) => byId.get(id)!)
            .filter(
              (item) => item.projectId === input.projectId && item.environment === input.environment
            ).length + 1,
        publishedByUserId: input.publishedByUserId,
        healthStatus: "pending",
        createdAt: new Date().toISOString()
      };
      byId.set(deployment.id, deployment);
      order.push(deployment.id);
      return deployment;
    },
    updateRuntime(id, input) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`unknown deployment '${id}'`);
      const next = { ...existing, ...input };
      byId.set(id, next);
      return next;
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
    discard(id) {
      byId.delete(id);
      const index = order.indexOf(id);
      if (index >= 0) order.splice(index, 1);
    },
    remove(id) {
      byId.delete(id);
      const index = order.indexOf(id);
      if (index >= 0) order.splice(index, 1);
    },
    removeProject(projectId) {
      const projectDeploymentIds = order.filter((id) => byId.get(id)?.projectId === projectId);
      for (const id of projectDeploymentIds) {
        byId.delete(id);
        order.splice(order.indexOf(id), 1);
      }
    },
    list(projectId) {
      return order
        .map((id) => byId.get(id)!)
        .filter((dep) => dep.projectId === projectId)
        .reverse();
    },
    getCurrent(slug, environment = "production") {
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const dep = byId.get(order[i])!;
        if (
          dep.slug === slug &&
          dep.environment === environment &&
          dep.healthStatus === "healthy"
        ) {
          return dep;
        }
      }
      return null;
    }
  };
}
