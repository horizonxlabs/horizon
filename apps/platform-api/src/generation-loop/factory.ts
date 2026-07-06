import { createMessageParser } from "./message-parser";
import { createMemoryLlmCompletionClient, createLiteLlmCompletionClient, type LlmCompletionClient } from "./llm-client";
import { createMemoryChatHistoryStore } from "./chat-history-store";
import { createActionRunner } from "./action-runner";
import { createMemoryCheckpointStore } from "./checkpoint-store";
import { createMemoryMigrationStore } from "./migration-store";
import { createErrorFeedbackTracker } from "./error-feedback";
import { createGenerationService } from "./generation-service";
import { loadGoldenTemplate } from "../workspace-orchestrator/template";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { resolveWorkspaceAdapterMode } from "../workspace-orchestrator/factory";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

export { createMessageParser };

export function createDefaultGenerationService(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
  env?: Record<string, string | undefined>;
  // Optional real DockerEngine instance to execute actions against. When omitted,
  // falls back to a placeholder that throws on use — see the app-factory.ts wiring
  // note for why the shared engine may not be reachable there today.
  docker?: DockerEngine;
}) {
  const env = opts.env ?? process.env;
  const mode = resolveWorkspaceAdapterMode(env);
  const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL);

  const llmClient: LlmCompletionClient =
    mode === "real" && hasLiteLlmConfig
      ? createLiteLlmCompletionClient({ baseUrl: env.EVCP_LITELLM_BASE_URL as string })
      : createMemoryLlmCompletionClient(["(memory llm stub — configure EVCP_LITELLM_BASE_URL for real completions)"]);

  const docker: DockerEngine =
    opts.docker ??
    ({
      execInContainer: async () => {
        throw new Error("docker engine not wired — pass a real DockerEngine via opts in production wiring");
      }
    } as unknown as DockerEngine);

  return createGenerationService({
    llmClient,
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template: loadGoldenTemplate(),
    getApiKey: (projectId) => opts.orchestrator.getWorkspace(projectId)?.id ?? "",
    getContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no running container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    commitAllChanges: async (projectId) => {
      opts.orchestrator.markActivity(projectId);
      // TODO: wire to the real git-commit-in-container flow once available; for now
      // this returns a placeholder sha so the turn can complete and be audited.
      const sha = "unimplemented-commit-sha";
      return sha;
    },
    onAudit: opts.onAudit
  });
}
