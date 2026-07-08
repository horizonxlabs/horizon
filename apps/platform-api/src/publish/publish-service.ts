import type { WorkspaceDeployment } from "@evcp/types";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { buildProdContainerSpec } from "../workspace-orchestrator/docker-engine";
import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";
import type { DeploymentStore } from "./deployment-store";
import type { HealthChecker } from "./health-checker";
import { runPrePublishChecks } from "./pre-publish-checks";

export type PublishOutcome =
  | { ok: true; deployment: WorkspaceDeployment }
  | { ok: false; reason: "pre_checks_failed"; failures: string[] }
  | { ok: false; reason: "health_failed"; deployment: WorkspaceDeployment };

export interface PublishServiceDeps {
  docker: DockerEngine;
  git: GitPort;
  migrations: MigrationStore;
  deployments: DeploymentStore;
  health: HealthChecker;
  resolveEnv: (projectId: string) => Record<string, string>;
  getDevContainerId: (projectId: string) => string;
  network?: string;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
}

export function createPublishService(deps: PublishServiceDeps) {
  const network = deps.network ?? "evcp-internal";
  const audit = (action: string, projectId: string, metadata?: Record<string, unknown>) =>
    deps.onAudit?.({ action, projectId, metadata });

  return {
    async publish(input: {
      projectId: string;
      slug: string;
      commitSha?: string;
      publishedByUserId: string;
    }): Promise<PublishOutcome> {
      const isRollback = Boolean(input.commitSha);
      const devContainerId = deps.getDevContainerId(input.projectId);

      // Resolve target commit (explicit = rollback/older; else current HEAD).
      const commitSha = input.commitSha ?? (await deps.git.currentCommit(input.projectId));
      if (isRollback) {
        await deps.git.checkoutCommit(input.projectId, commitSha);
      }

      audit(isRollback ? "workspace.rollback" : "workspace.publish", input.projectId, {
        slug: input.slug,
        commitSha
      });

      // Pre-publish checks (build, migrations, clean tree) in the dev container.
      const checks = await runPrePublishChecks(
        { docker: deps.docker, git: deps.git, migrations: deps.migrations },
        { projectId: input.projectId, slug: input.slug, containerId: devContainerId, commitSha }
      );
      if (!checks.ok) {
        audit("workspace.publish_rejected", input.projectId, { slug: input.slug, failures: checks.failures });
        return { ok: false, reason: "pre_checks_failed", failures: checks.failures };
      }

      // Build the production image from the (built) dev container, tagged to the commit.
      const imageTag = `evcp-prod-${input.slug}:${commitSha}`;
      await deps.docker.commitContainer(devContainerId, imageTag);

      // Start a SEPARATE production container. Same secrets as dev + NODE_ENV=production.
      const spec = buildProdContainerSpec({
        slug: input.slug,
        image: imageTag,
        env: deps.resolveEnv(input.projectId),
        network,
        workspaceVolume: `evcp-ws-${input.slug}-data`
      });
      const { containerId } = await deps.docker.createContainer(spec);
      await deps.docker.startContainer(containerId);

      // Record the deployment (pending) before the health gate.
      const deployment = deps.deployments.create({
        projectId: input.projectId,
        slug: input.slug,
        environment: "production",
        commitSha,
        imageTag,
        containerId,
        publishedByUserId: input.publishedByUserId
      });

      // Health-check gate.
      const healthy = await deps.health.check(`http://evcp-prod-${input.slug}:3000/`);
      const finalized = deps.deployments.updateHealth(deployment.id, healthy ? "healthy" : "failed");

      if (!healthy) {
        // keep old version live; tear down the failed container (best-effort)
        await deps.docker.stopContainer(containerId).catch(() => undefined);
        await deps.docker.removeContainer(containerId).catch(() => undefined);
        audit("workspace.deploy_failed", input.projectId, { slug: input.slug, commitSha, deploymentId: finalized.id });
        return { ok: false, reason: "health_failed", deployment: finalized };
      }

      audit("workspace.deploy", input.projectId, {
        slug: input.slug,
        commitSha,
        imageTag,
        deploymentId: finalized.id
      });
      return { ok: true, deployment: finalized };
    }
  };
}
