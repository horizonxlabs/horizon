import type { WorkspaceAgentMode, WorkspaceChatMessage } from "@evcp/types";
import type { AiScenario, PlatformUser } from "../platform-services";
import type { GovernedAiExecutor } from "../ai-governance/execution-service";
import type { ActionRunner } from "./action-runner";
import type { ChatHistoryStore } from "./chat-history-store";
import type { CheckpointStore } from "./checkpoint-store";
import type { GovernedContext } from "./generation-stream-helpers";
import type { GoldenTemplate } from "../workspace-orchestrator/template";
import type { ChatStreamEvent } from "./generation-types";
import type { PiAgentLimits } from "./pi-limits";

export interface GenerationServiceDeps {
  resolveGovernedContext?: (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
  }) => Promise<GovernedContext>;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  template: GoldenTemplate;
  getContainerId: (projectId: string) => string;
  readContextFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  listWorkspaceTree?: (containerId: string) => Promise<string[]>;
  checkFileSyntax?: (containerId: string, path: string) => Promise<string>;
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

export interface GenerationService {
  history(projectId: string): Promise<WorkspaceChatMessage[]>;
  restoreToCommit(projectId: string, commitSha: string): Promise<void>;
  listWorkspaceFiles(projectId: string): Promise<Array<{ path: string; content: string }>>;
  runTurn(input: {
    projectId: string;
    prompt: string;
    agentMode?: WorkspaceAgentMode;
    actor?: PlatformUser;
    approvedPlan?: string;
    signal?: AbortSignal;
  }): AsyncIterable<ChatStreamEvent>;
}

export type PiGenerationServiceDeps = GenerationServiceDeps & {
  governedAiExecutor: Pick<GovernedAiExecutor, "executeAgentRound">;
  limits?: Partial<PiAgentLimits>;
};
