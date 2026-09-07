import type { GovernedAiExecutor } from "../ai-governance/execution-service";
import { createPrismaChatHistoryStore } from "../persistence/chat-history-repository";
import { createPrismaWorkspaceCheckpointStore } from "../persistence/workspace-checkpoint-repository";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { createDockerSocketEngine } from "../workspace-orchestrator/docker-socket-engine";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { resolveWorkspacePreviewLocation } from "../workspace-orchestrator/runtime-location";
import { loadGoldenTemplate } from "../workspace-orchestrator/template";
import { createActionRunner } from "./action-runner";
import { createMemoryChatHistoryStore, type ChatHistoryStore } from "./chat-history-store";
import { createMemoryCheckpointStore } from "./checkpoint-store";
import {
  createContainerFileReader,
  createWorkspaceFileBrowserReader,
  listWorkspaceTree,
  probeWorkspaceRuntime
} from "./container-files";
import { createContainerGitCommitter } from "./container-git";
import type { GenerationServiceDeps } from "./generation-service-types";
import { createMemoryMigrationStore, type MigrationStore } from "./migration-store";
import { createPgMigrationRunner } from "./migration-runner";
import { createPiGenerationService } from "./pi-generation-service";
import {
  buildSyntaxCheckCommand,
  isWorkspaceNodeModulesAccessError,
  WORKSPACE_NODE_MODULES_REPAIR_COMMAND
} from "./turn-checks";

export async function createDefaultGenerationService(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: {
    action: string;
    projectId: string;
    metadata?: Record<string, unknown>;
  }) => void;
  env?: Record<string, string | undefined>;
  docker?: DockerEngine;
  migrations?: MigrationStore;
  chatHistory?: ChatHistoryStore;
  governedAiExecutor?: Pick<GovernedAiExecutor, "executeAgentRound">;
  resolveGovernedContext?: GenerationServiceDeps["resolveGovernedContext"];
}) {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  if (mode === "real" && !opts.governedAiExecutor) {
    throw new Error("Real generation requires a structured governed AI executor");
  }
  const governedAiExecutor =
    opts.governedAiExecutor ??
    ({
      async executeAgentRound() {
        throw new Error("Structured governed AI executor is not configured");
      }
    } satisfies Pick<GovernedAiExecutor, "executeAgentRound">);
  const corePersistenceMode = (env.EVCP_CORE_PERSISTENCE ?? "legacy").trim().toLowerCase();
  const chatHistory =
    opts.chatHistory ??
    (corePersistenceMode === "prisma"
      ? await createPrismaChatHistoryStore(env.DATABASE_URL)
      : createMemoryChatHistoryStore());
  const checkpoints =
    corePersistenceMode === "prisma"
      ? await createPrismaWorkspaceCheckpointStore(env.DATABASE_URL)
      : createMemoryCheckpointStore();
  const docker =
    opts.docker ??
    (mode === "real"
      ? createDockerSocketEngine()
      : ({
          execInContainer: async () => {
            throw new Error("docker engine not wired (memory mode)");
          }
        } as unknown as DockerEngine));
  const gitCommitter = createContainerGitCommitter(docker);
  const fileReader = createContainerFileReader(docker);
  const fileBrowserReader = createWorkspaceFileBrowserReader(docker);
  const migrationRunner = createPgMigrationRunner();

  const template = env.EVCP_TEMPLATE_DIR
    ? loadGoldenTemplate(env.EVCP_TEMPLATE_DIR)
    : loadGoldenTemplate();

  const service = createPiGenerationService({
    governedAiExecutor,
    ...(opts.resolveGovernedContext ? { resolveGovernedContext: opts.resolveGovernedContext } : {}),
    chatHistory,
    checkpoints,
    actionRunner: createActionRunner({
      docker,
      checkpoints,
      migrations: opts.migrations ?? createMemoryMigrationStore(),
      ...(mode === "real"
        ? { runMigrationSql: migrationRunner.run, runMigrationBatchSql: migrationRunner.runBatch }
        : {})
    }),
    template,
    getContainerId: (projectId) => workspaceContainerId(opts.orchestrator, projectId),
    readContextFiles: (containerId) => fileReader.read(containerId),
    listWorkspaceTree: (containerId) => listWorkspaceTree(docker, containerId),
    checkFileSyntax: async (containerId, path) => {
      const run = async () => {
        const result = await docker.execInContainer(containerId, [
          "sh",
          "-c",
          buildSyntaxCheckCommand(path)
        ]);
        return (result.stdout ?? "").replace(/\r\n/g, "\n");
      };
      const output = await run();
      if (!isWorkspaceNodeModulesAccessError(output)) return output;
      // Self-heal the host filesystem quirk documented on
      // isWorkspaceNodeModulesAccessError and retry once before giving up — this is not a
      // real syntax error and shouldn't cost the model a feedback round or a rollback.
      await docker.execInContainer(containerId, [
        "sh",
        "-c",
        WORKSPACE_NODE_MODULES_REPAIR_COMMAND
      ]);
      return run();
    },
    readWorkspaceFiles: (containerId) => fileBrowserReader.read(containerId),
    // These take the caller's already-resolved `containerId` as-is instead of re-resolving
    // it from `projectId` — see the doc comment on `workspaceGuard` in
    // generation-service-types.ts for why that consistency matters mid-turn.
    workspaceGuard: {
      prepare: async (projectId, containerId) => {
        opts.orchestrator.markActivity(projectId);
        return gitCommitter.prepare(containerId);
      },
      renewSnapshot: async (projectId, containerId, snapshotToken) => {
        opts.orchestrator.markActivity(projectId);
        await gitCommitter.renewSnapshot(containerId, snapshotToken);
      },
      hasChanges: async (_projectId, containerId, snapshotToken) => {
        return gitCommitter.hasChanges(containerId, snapshotToken);
      },
      validate: async (_projectId, containerId) => {
        await gitCommitter.validate(containerId);
      },
      restore: async (projectId, commitSha) => {
        await gitCommitter.restore(workspaceContainerId(opts.orchestrator, projectId), commitSha);
      },
      restoreSnapshot: async (_projectId, containerId, snapshotToken) => {
        await gitCommitter.restoreSnapshot(containerId, snapshotToken);
      },
      releaseSnapshot: async (_projectId, containerId, snapshotToken) => {
        await gitCommitter.releaseSnapshot(containerId, snapshotToken);
      }
    },
    commitAllChanges: async (projectId, containerId, message) => {
      opts.orchestrator.markActivity(projectId);
      return gitCommitter.commit(containerId, message);
    },
    onAudit: opts.onAudit
  });

  return {
    ...service,
    // Self-debug surface: post-turn runtime probe + template ownership info for tag
    // classification. Attached here (not in generation-service) to hold its size ratchet.
    templateLockedFiles: template.lockedFiles,
    probeRuntime: async (projectId: string): Promise<{ status: number; errors: string[] }> => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      const unavailable = { status: 0, errors: [] };
      if (!workspace?.containerId || workspace.state !== "running") return unavailable;
      const { containerId, resourceKey } = workspace;
      try {
        const location = await resolveWorkspacePreviewLocation(docker, workspace);
        if (!location) return unavailable;
        const container = await docker.inspectContainer(location.containerName);
        const current = opts.orchestrator.getWorkspace(projectId);
        if (
          !container?.running ||
          container.containerId !== containerId ||
          current?.state !== "running" ||
          current.containerId !== containerId ||
          current.resourceKey !== resourceKey
        )
          return unavailable;
        return probeWorkspaceRuntime(docker, containerId, location.previewKey);
      } catch {
        // Unavailable or untrusted infrastructure is not an application runtime bug.
        return unavailable;
      }
    }
  };
}

function workspaceContainerId(orchestrator: WorkspaceOrchestrator, projectId: string): string {
  const containerId = orchestrator.getWorkspace(projectId)?.containerId;
  if (!containerId) throw new Error(`no running container for project '${projectId}'`);
  return containerId;
}
