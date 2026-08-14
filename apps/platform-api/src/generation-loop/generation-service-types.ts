import type { AiScenario, PlatformUser } from "../platform-services";
import type { ActionRunner } from "./action-runner";
import type { ChatHistoryStore } from "./chat-history-store";
import type { CheckpointStore } from "./checkpoint-store";
import type { createErrorFeedbackTracker } from "./error-feedback";
import type { GovernedContext } from "./generation-stream-helpers";
import type { StreamChunk } from "./governed-completion";
import type { LlmCompletionClient } from "./llm-client";
import type { ActionType } from "./message-parser";
import type { GoldenTemplate } from "../workspace-orchestrator/template";

export interface GenerationServiceDeps {
  llmClient: LlmCompletionClient;
  governedCompletion?: (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
    prompt: string;
    requestId: string;
  }) => AsyncIterable<StreamChunk>;
  resolveGovernedContext?: (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
  }) => Promise<GovernedContext>;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  errorFeedback: ReturnType<typeof createErrorFeedbackTracker>;
  template: GoldenTemplate;
  getApiKey: (projectId: string) => string;
  getContainerId: (projectId: string) => string;
  readContextFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  listWorkspaceTree?: (containerId: string) => Promise<string[]>;
  readWorkspaceFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  workspaceGuard: {
    prepare(projectId: string): Promise<string>;
    validate(projectId: string): Promise<void>;
    restore(projectId: string, commitSha: string): Promise<void>;
  };
  commitAllChanges: (projectId: string, message: string) => Promise<string>;
  checkpoints?: CheckpointStore;
  onAudit?: (event: {
    action: string;
    projectId: string;
    metadata?: Record<string, unknown>;
  }) => void;
}

export interface OpenAction {
  id: string;
  type: ActionType;
  filePath?: string;
  name?: string;
  content: string;
}
