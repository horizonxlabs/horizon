import { createMessageParser } from "./message-parser";
import {
  createMemoryLlmCompletionClient,
  createLiteLlmCompletionClient,
  type LlmCompletionClient
} from "./llm-client";
import { createMemoryChatHistoryStore, type ChatHistoryStore } from "./chat-history-store";
import { createPrismaChatHistoryStore } from "../persistence/chat-history-repository";
import { createActionRunner } from "./action-runner";
import { createMemoryCheckpointStore } from "./checkpoint-store";
import { createPrismaWorkspaceCheckpointStore } from "../persistence/workspace-checkpoint-repository";
import { createMemoryMigrationStore, type MigrationStore } from "./migration-store";
import { createErrorFeedbackTracker } from "./error-feedback";
import { createGenerationService } from "./generation-service";
import { loadGoldenTemplate } from "../workspace-orchestrator/template";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { createDockerSocketEngine } from "../workspace-orchestrator/docker-socket-engine";
import { createContainerGitCommitter } from "./container-git";
import { createContainerFileReader, createWorkspaceFileBrowserReader } from "./container-files";
import { createPgMigrationRunner } from "./migration-runner";
import type { GovernedAiExecutor } from "../ai-governance/execution-service";
import type { AiExecutionEvidence } from "../ai-governance/execution-service";

export { createMessageParser };

export async function createDefaultGenerationService(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: {
    action: string;
    projectId: string;
    metadata?: Record<string, unknown>;
  }) => void;
  env?: Record<string, string | undefined>;
  // Optional real DockerEngine instance to execute actions against. When omitted,
  // falls back to a placeholder that throws on use — see the app-factory.ts wiring
  // note for why the shared engine may not be reachable there today.
  docker?: DockerEngine;
  // Optional shared MigrationStore. Threaded from app-factory so the publish pre-checks read the
  // same applied-migrations record the generation loop writes. Falls back to a fresh memory store.
  migrations?: MigrationStore;
  // Optional ChatHistoryStore override (tests inject a memory store directly). Falls back to a
  // Prisma-backed store when EVCP_CORE_PERSISTENCE=prisma, so chat history survives restarts.
  chatHistory?: ChatHistoryStore;
  governedAiExecutor?: Pick<GovernedAiExecutor, "execute">;
  onGovernedExecution?: (evidence: AiExecutionEvidence) => void | Promise<void>;
}) {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL);
  const corePersistenceMode = (env.EVCP_CORE_PERSISTENCE ?? "legacy").trim().toLowerCase();
  const chatHistory: ChatHistoryStore =
    opts.chatHistory ??
    (corePersistenceMode === "prisma"
      ? await createPrismaChatHistoryStore(env.DATABASE_URL)
      : createMemoryChatHistoryStore());
  const checkpoints =
    corePersistenceMode === "prisma"
      ? await createPrismaWorkspaceCheckpointStore(env.DATABASE_URL)
      : createMemoryCheckpointStore();

  const llmClient: LlmCompletionClient =
    mode === "real" && hasLiteLlmConfig
      ? createLiteLlmCompletionClient({ baseUrl: env.EVCP_LITELLM_BASE_URL as string })
      : createMemoryLlmCompletionClient([
          "(memory llm stub — configure EVCP_LITELLM_BASE_URL for real completions)"
        ]);

  // Real mode: a fresh socket engine (stateless over /var/run/docker.sock, equivalent to the
  // orchestrator's). Memory/omitted: a throwing placeholder that never runs in the mem tests.
  const docker: DockerEngine =
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

  return createGenerationService({
    llmClient,
    ...(opts.governedAiExecutor
      ? {
          governedCompletion: async ({ actor, projectId, scenario, prompt, requestId }) => {
            const execution = await opts.governedAiExecutor!.execute(actor, {
              scenario,
              projectId,
              prompt,
              requestId,
              requestedTokens: 1_200
            });
            await opts.onGovernedExecution?.(execution.evidence);
            if (
              execution.status === "blocked" ||
              execution.status === "failed" ||
              !execution.text
            ) {
              throw new Error(
                `Governed AI completion unavailable: ${execution.evidence.failureReason ?? execution.status}`
              );
            }
            return execution.text;
          }
        }
      : {}),
    chatHistory,
    checkpoints,
    actionRunner: createActionRunner({
      docker,
      checkpoints,
      migrations: opts.migrations ?? createMemoryMigrationStore(),
      ...(mode === "real"
        ? {
            runMigrationSql: createPgMigrationRunner().run,
            runMigrationBatchSql: createPgMigrationRunner().runBatch
          }
        : {})
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template: env.EVCP_TEMPLATE_DIR
      ? loadGoldenTemplate(env.EVCP_TEMPLATE_DIR)
      : loadGoldenTemplate(),
    // MVP: authenticate to LiteLLM with the master key server-side. Never surfaced to the Creator.
    // Per-project virtual-key budgets are a follow-up.
    getApiKey: () => env.EVCP_LITELLM_MASTER_KEY ?? "",
    getContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no running container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    readContextFiles: (containerId) => fileReader.read(containerId),
    readWorkspaceFiles: (containerId) => fileBrowserReader.read(containerId),
    workspaceGuard: {
      prepare: async (projectId) => {
        opts.orchestrator.markActivity(projectId);
        const workspace = opts.orchestrator.getWorkspace(projectId);
        if (!workspace?.containerId)
          throw new Error(`no running container for project '${projectId}'`);
        return gitCommitter.prepare(workspace.containerId);
      },
      validate: async (projectId) => {
        const workspace = opts.orchestrator.getWorkspace(projectId);
        if (!workspace?.containerId)
          throw new Error(`no running container for project '${projectId}'`);
        await gitCommitter.validate(workspace.containerId);
      },
      restore: async (projectId, commitSha) => {
        const workspace = opts.orchestrator.getWorkspace(projectId);
        if (!workspace?.containerId)
          throw new Error(`no running container for project '${projectId}'`);
        await gitCommitter.restore(workspace.containerId, commitSha);
      }
    },
    commitAllChanges: async (projectId, message) => {
      opts.orchestrator.markActivity(projectId);
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        // No container (e.g. memory tests): return a sentinel so the turn still completes.
        return "no-container-commit";
      }
      return gitCommitter.commit(workspace.containerId, message);
    },
    onAudit: opts.onAudit
  });
}
