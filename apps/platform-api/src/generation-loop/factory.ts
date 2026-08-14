import type { GovernedAiExecutor } from "../ai-governance/execution-service";
import { createPrismaChatHistoryStore } from "../persistence/chat-history-repository";
import { createPrismaWorkspaceCheckpointStore } from "../persistence/workspace-checkpoint-repository";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { createDockerSocketEngine } from "../workspace-orchestrator/docker-socket-engine";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { loadGoldenTemplate } from "../workspace-orchestrator/template";
import { createActionRunner } from "./action-runner";
import { createMemoryChatHistoryStore, type ChatHistoryStore } from "./chat-history-store";
import { createMemoryCheckpointStore } from "./checkpoint-store";
import {
  createContainerFileReader,
  createWorkspaceFileBrowserReader,
  listWorkspaceTree
} from "./container-files";
import { createContainerGitCommitter } from "./container-git";
import type { GenerationServiceDeps } from "./generation-service-types";
import { createMemoryMigrationStore, type MigrationStore } from "./migration-store";
import { createPgMigrationRunner } from "./migration-runner";
import { createPiGenerationService } from "./pi-generation-service";

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

  return createPiGenerationService({
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
    template: env.EVCP_TEMPLATE_DIR
      ? loadGoldenTemplate(env.EVCP_TEMPLATE_DIR)
      : loadGoldenTemplate(),
    getContainerId: (projectId) => workspaceContainerId(opts.orchestrator, projectId),
    readContextFiles: (containerId) => fileReader.read(containerId),
    listWorkspaceTree: (containerId) => listWorkspaceTree(docker, containerId),
    readWorkspaceFiles: (containerId) => fileBrowserReader.read(containerId),
    workspaceGuard: {
      prepare: async (projectId) => {
        opts.orchestrator.markActivity(projectId);
        return gitCommitter.prepare(workspaceContainerId(opts.orchestrator, projectId));
      },
      validate: async (projectId) => {
        await gitCommitter.validate(workspaceContainerId(opts.orchestrator, projectId));
      },
      restore: async (projectId, commitSha) => {
        await gitCommitter.restore(workspaceContainerId(opts.orchestrator, projectId), commitSha);
      }
    },
    commitAllChanges: async (projectId, message) => {
      opts.orchestrator.markActivity(projectId);
      return gitCommitter.commit(workspaceContainerId(opts.orchestrator, projectId), message);
    },
    onAudit: opts.onAudit
  });
}

function workspaceContainerId(orchestrator: WorkspaceOrchestrator, projectId: string): string {
  const containerId = orchestrator.getWorkspace(projectId)?.containerId;
  if (!containerId) throw new Error(`no running container for project '${projectId}'`);
  return containerId;
}
