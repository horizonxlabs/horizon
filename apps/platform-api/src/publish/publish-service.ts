import type { WorkspaceDeployment, EnvironmentName } from "@evcp/types";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { buildAppContainerSpec } from "../workspace-orchestrator/docker-engine";
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

  // Shared deploy flow: commit a source container to an env-scoped image, start a SEPARATE
  // container for that environment, health-gate it, and record the deployment. `publish` sources
  // the image from the dev container; `promote` sources it from the validated staging container.
  const deployFromContainer = async (input: {
    projectId: string;
    slug: string;
    environment: EnvironmentName;
    commitSha: string;
    sourceContainerId: string;
    publishedByUserId: string;
  }): Promise<PublishOutcome> => {
    const { environment } = input;

    // Build the environment image from the source container, tagged to the commit.
    const imageTag = `evcp-${environment}-${input.slug}:${input.commitSha}`;
    await deps.docker.commitContainer(input.sourceContainerId, imageTag);

    // Start a SEPARATE container for this environment. Same secrets as dev + NODE_ENV=production.
    // DB isolation note: staging reuses the project's resolveEnv (same DATABASE_URL) but gets its
    // own container + volume — true staging-DB isolation (separate schema/database) is a follow-up.
    const spec = buildAppContainerSpec(
      {
        slug: input.slug,
        image: imageTag,
        env: deps.resolveEnv(input.projectId),
        network,
        workspaceVolume: `evcp-ws-${input.slug}-${environment}-data`
      },
      environment
    );
    const { containerId } = await deps.docker.createContainer(spec);
    await deps.docker.startContainer(containerId);

    // Record the deployment (pending) before the health gate.
    const deployment = deps.deployments.create({
      projectId: input.projectId,
      slug: input.slug,
      environment,
      commitSha: input.commitSha,
      imageTag,
      containerId,
      publishedByUserId: input.publishedByUserId
    });

    // Health-check gate.
    const healthy = await deps.health.check(`http://evcp-${environment}-${input.slug}:3000/`);
    const finalized = deps.deployments.updateHealth(deployment.id, healthy ? "healthy" : "failed");

    if (!healthy) {
      // keep old version live; tear down the failed container (best-effort)
      await deps.docker.stopContainer(containerId).catch(() => undefined);
      await deps.docker.removeContainer(containerId).catch(() => undefined);
      audit("workspace.deploy_failed", input.projectId, {
        slug: input.slug,
        environment,
        commitSha: input.commitSha,
        deploymentId: finalized.id
      });
      return { ok: false, reason: "health_failed", deployment: finalized };
    }

    audit("workspace.deploy", input.projectId, {
      slug: input.slug,
      environment,
      commitSha: input.commitSha,
      imageTag,
      deploymentId: finalized.id
    });
    return { ok: true, deployment: finalized };
  };

  return {
    async publish(input: {
      projectId: string;
      slug: string;
      environment: EnvironmentName;
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
        environment: input.environment,
        commitSha
      });

      // Pre-publish checks (build, migrations, clean tree) in the dev container.
      const checks = await runPrePublishChecks(
        { docker: deps.docker, git: deps.git, migrations: deps.migrations },
        { projectId: input.projectId, slug: input.slug, containerId: devContainerId, commitSha }
      );
      if (!checks.ok) {
        audit("workspace.publish_rejected", input.projectId, {
          slug: input.slug,
          environment: input.environment,
          failures: checks.failures
        });
        return { ok: false, reason: "pre_checks_failed", failures: checks.failures };
      }

      return deployFromContainer({
        projectId: input.projectId,
        slug: input.slug,
        environment: input.environment,
        commitSha,
        sourceContainerId: devContainerId,
        publishedByUserId: input.publishedByUserId
      });
    },

    // Promote the current HEALTHY staging deployment to production WITHOUT rebuilding: the running
    // staging container is committed to a production image and started as prod, so production runs
    // the exact bits validated in staging (same commitSha, no fresh build from dev/HEAD).
    async promote(input: {
      projectId: string;
      slug: string;
      publishedByUserId: string;
    }): Promise<PublishOutcome> {
      const staging = deps.deployments.getCurrent(input.slug, "staging");
      if (!staging) {
        throw new Error(`no healthy staging deployment to promote for slug '${input.slug}'`);
      }
      if (!staging.containerId) {
        throw new Error(`staging deployment '${staging.id}' has no container to promote`);
      }

      audit("workspace.promote", input.projectId, {
        slug: input.slug,
        commitSha: staging.commitSha,
        fromDeploymentId: staging.id
      });

      return deployFromContainer({
        projectId: input.projectId,
        slug: input.slug,
        environment: "production",
        commitSha: staging.commitSha,
        sourceContainerId: staging.containerId,
        publishedByUserId: input.publishedByUserId
      });
    }
  };
}
