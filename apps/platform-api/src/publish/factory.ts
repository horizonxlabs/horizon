import { createPublishService } from "./publish-service";
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

// Shared deployment store so routes + /apps proxy read the same deployments.
export function createDefaultPublishStack(opts: {
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
}): { publishService: ReturnType<typeof createPublishService>; deployments: DeploymentStore } {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const deployments = createMemoryDeploymentStore();
  const migrations = opts.migrations ?? createMemoryMigrationStore();

  const getDevContainerId = (projectId: string): string => {
    const workspace = opts.orchestrator.getWorkspace(projectId);
    if (!workspace?.containerId) {
      throw new Error(`no dev container for project '${projectId}'`);
    }
    return workspace.containerId;
  };

  let docker: DockerEngine;
  let git: GitPort;
  let resolveEnv: (projectId: string) => Record<string, string>;

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
    resolveEnv = () => ({});
  }

  const publishService = createPublishService({
    docker,
    git,
    migrations,
    deployments,
    // Published containers boot via npm install + next dev, which can take tens of seconds — give
    // the health gate a ~60s window (30 × 2s) instead of the ~5s default so a slow-but-healthy
    // start isn't reported as failed.
    health: createHttpHealthChecker({ retries: 30, delayMs: 2000 }),
    resolveEnv,
    getDevContainerId,
    // Attach published containers to the same network the orchestrator puts dev containers on
    // (docker_evcp-internal in this compose), not the bare "evcp-internal" default.
    network: env.EVCP_WORKSPACE_NETWORK ?? undefined,
    onAudit: opts.onAudit
  });

  return { publishService, deployments };
}
