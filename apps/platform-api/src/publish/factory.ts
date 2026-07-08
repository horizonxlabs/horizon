import { createPublishService } from "./publish-service";
import { createMemoryGitPort } from "./git-port";
import { createMemoryDeploymentStore, type DeploymentStore } from "./deployment-store";
import { createHttpHealthChecker } from "./health-checker";
import { createMemoryMigrationStore } from "../generation-loop/migration-store";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";

// Shared deployment store so routes + /apps proxy read the same deployments.
export function createDefaultPublishStack(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
}): { publishService: ReturnType<typeof createPublishService>; deployments: DeploymentStore } {
  const deployments = createMemoryDeploymentStore();

  // NOTE: DockerEngine, GitPort, and MigrationStore are memory-backed placeholders here.
  // Real publish requires the SAME DockerEngine instance the orchestrator uses, a real
  // git implementation, and the shared MigrationStore from the generation loop. Those are
  // threaded in a follow-up (see Plan 4's DockerEngine-wiring follow-up). Until then, the
  // publish routes are reachable and fully unit-tested, but a real container publish is latent.
  const docker = {
    execInContainer: async () => ({ stdout: "", stderr: "publish docker not wired", exitCode: 1 }),
    commitContainer: async () => {
      throw new Error("publish docker not wired");
    },
    createContainer: async () => {
      throw new Error("publish docker not wired");
    },
    startContainer: async () => {},
    stopContainer: async () => {},
    removeContainer: async () => {}
  } as never;

  const publishService = createPublishService({
    docker,
    git: createMemoryGitPort({}),
    migrations: createMemoryMigrationStore(),
    deployments,
    health: createHttpHealthChecker(),
    resolveEnv: () => ({}),
    getDevContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no dev container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    onAudit: opts.onAudit
  });

  return { publishService, deployments };
}
