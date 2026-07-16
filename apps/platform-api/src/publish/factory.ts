import { createPublishService } from "./publish-service";
import type { EnvironmentName } from "@evcp/types";
import { createMemoryGitPort, createDockerGitPort, type GitPort } from "./git-port";
import { createMemoryDeploymentStore, type DeploymentStore } from "./deployment-store";
import { createHttpHealthChecker } from "./health-checker";
import {
  createMemoryMigrationStore,
  type MigrationStore
} from "../generation-loop/migration-store";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { createDockerSocketEngine } from "../workspace-orchestrator/docker-socket-engine";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { rehydrateRunningDeployment } from "./deployment-rehydration";
import { createPrismaDeploymentStore } from "./prisma-deployment-store";

/**
 * Publish routes survive a Platform API restart: the workspace record is in-memory, whereas its
 * managed dev container continues running in Docker. Re-run the orchestrator's idempotent
 * provision operation to attach that container (and restore its runtime secrets) before publish.
 */
export async function getOrRecoverDevContainerId(
  orchestrator: Pick<WorkspaceOrchestrator, "getWorkspace" | "provisionWorkspace">,
  projectId: string
): Promise<string> {
  const workspace =
    orchestrator.getWorkspace(projectId) ??
    (await orchestrator.provisionWorkspace({ projectId, slug: projectId }));
  if (!workspace.containerId) {
    throw new Error(`no dev container for project '${projectId}'`);
  }
  return workspace.containerId;
}

// Shared deployment store so routes + /apps proxy read the same deployments.
export async function createDefaultPublishStack(opts: {
  orchestrator: WorkspaceOrchestrator;
  // Shared MigrationStore from the generation loop so the publish pre-checks see the migrations
  // the generation loop actually applied. Falls back to a fresh memory store when omitted.
  migrations?: MigrationStore;
  env?: Record<string, string | undefined>;
  onAudit?: (event: {
    action: string;
    projectId: string;
    metadata?: Record<string, unknown>;
  }) => void;
}): Promise<{
  publishService: ReturnType<typeof createPublishService>;
  deployments: DeploymentStore;
  rehydrateDeployment: (slug: string, environment: EnvironmentName) => Promise<unknown>;
}> {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const deployments =
    (env.EVCP_CORE_PERSISTENCE ?? "legacy").trim().toLowerCase() === "prisma"
      ? await createPrismaDeploymentStore(env.DATABASE_URL)
      : createMemoryDeploymentStore();
  const migrations = opts.migrations ?? createMemoryMigrationStore();

  const getDevContainerId = (projectId: string) =>
    getOrRecoverDevContainerId(opts.orchestrator, projectId);

  let docker: DockerEngine;
  let git: GitPort;
  let resolveEnv: (projectId: string) => Promise<Record<string, string>>;

  if (mode === "real") {
    // Real container publish: a socket engine over the same /var/run/docker.sock the orchestrator
    // uses (network evcp-internal), git run inside the dev workspace container, and the project's
    // real resolved secrets (DATABASE_URL, S3_*, …) so the deployed container matches dev.
    docker = createDockerSocketEngine();
    git = createDockerGitPort(docker, getDevContainerId);
    resolveEnv = (projectId) => opts.orchestrator.resolveEnv(projectId);
  } else {
    // Memory mode: keep the off-Docker stubs so the whole suite stays green without a Docker socket.
    docker = {
      execInContainer: async () => ({
        stdout: "",
        stderr: "publish docker not wired",
        exitCode: 1
      }),
      commitContainer: async () => {
        throw new Error("publish docker not wired");
      },
      buildImage: async () => {
        throw new Error("publish docker not wired");
      },
      createContainer: async () => {
        throw new Error("publish docker not wired");
      },
      startContainer: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {}
    } as never;
    git = createMemoryGitPort({});
    resolveEnv = async () => ({});
  }

  const health = createHttpHealthChecker({ retries: 30, delayMs: 2000 });
  const publishService = createPublishService({
    docker,
    git,
    migrations,
    deployments,
    // Published containers boot via npm install + next dev, which can take tens of seconds — give
    // the health gate a ~60s window (30 × 2s) instead of the ~5s default so a slow-but-healthy
    // start isn't reported as failed.
    health,
    resolveEnv,
    getDevContainerId,
    // Attach published containers to the same network the orchestrator puts dev containers on
    // (EVCP_WORKSPACE_NETWORK, `evcp-internal` in this compose), falling back to the default.
    network: env.EVCP_WORKSPACE_NETWORK ?? undefined,
    onAudit: opts.onAudit
  });

  return {
    publishService,
    deployments,
    rehydrateDeployment: async (slug, environment) => {
      if (mode !== "real") return null;
      return rehydrateRunningDeployment({ deployments, docker, health, slug, environment });
    }
  };
}
