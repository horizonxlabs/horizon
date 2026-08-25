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
  // Every method below except `restore` takes the exact `containerId` the calling turn
  // already resolved (once, at turn start) rather than re-resolving it from `projectId`.
  // A turn's file/edit/shell actions all run against that one pinned container; if git
  // operations independently re-resolved the orchestrator's *current* container instead,
  // a mid-turn container swap (crash/recreate) would make `hasChanges` silently compare
  // the wrong (unwritten) container against its snapshot — real writes would vanish with
  // no error and no commit. `restore` is exempt: it backs the standalone "restore to an
  // earlier checkpoint" action, which never runs inside a turn's actionRunner scope.
  workspaceGuard: {
    prepare(projectId: string, containerId: string): Promise<string>;
    renewSnapshot?(projectId: string, containerId: string, snapshotToken: string): Promise<void>;
    hasChanges(projectId: string, containerId: string, snapshotToken: string): Promise<boolean>;
    validate(projectId: string, containerId: string): Promise<void>;
    restore(projectId: string, commitSha: string): Promise<void>;
    restoreSnapshot(projectId: string, containerId: string, snapshotToken: string): Promise<void>;
    releaseSnapshot(projectId: string, containerId: string, snapshotToken: string): Promise<void>;
  };
  commitAllChanges: (projectId: string, containerId: string, message: string) => Promise<string>;
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
    assertCurrent?: () => Promise<void>;
  }): AsyncIterable<ChatStreamEvent>;
}

export type PiGenerationServiceDeps = GenerationServiceDeps & {
  governedAiExecutor: Pick<GovernedAiExecutor, "executeAgentRound">;
  limits?: Partial<PiAgentLimits>;
};
