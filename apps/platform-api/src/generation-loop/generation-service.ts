import { randomUUID } from "node:crypto";
import type { WorkspaceAgentMode, WorkspaceChatMessage, WorkspaceChatAction } from "@evcp/types";
import type { GoldenTemplate } from "../workspace-orchestrator/template";
import { createMessageParser, type ActionType } from "./message-parser";
import type { LlmCompletionClient } from "./llm-client";
import type { ChatHistoryStore } from "./chat-history-store";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner";
import type { createErrorFeedbackTracker } from "./error-feedback";
import { selectContextFiles } from "./context-selector";
import { buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import type { AiScenario, PlatformUser } from "../platform-services";
import type { CheckpointStore } from "./checkpoint-store";
import type { ChatStreamEvent } from "./generation-types";
import { resolveGovernedCompletion } from "./governed-completion";
import {
  buildActionPreview,
  clipActionText,
  describeRunnable,
  parseEditBody
} from "./generation-action-utils";
import { createProjectTurnLock } from "./project-turn-lock";

export type { ActionActionType, ChatStreamEvent } from "./generation-types";

export interface GenerationServiceDeps {
  llmClient: LlmCompletionClient;
  /**
   * The private-server path supplies this adapter so workspace chat uses the same
   * governed route, guardrails, quota, retry and evidence store as every other AI action.
   * Keeping the LLM client as the explicit fallback preserves isolated memory tests only.
   */
  governedCompletion?: (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
    prompt: string;
    requestId: string;
  }) => AsyncIterable<string>;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  errorFeedback: ReturnType<typeof createErrorFeedbackTracker>;
  template: GoldenTemplate;
  getApiKey: (projectId: string) => string;
  getContainerId: (projectId: string) => string;
  readContextFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
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

interface OpenAction {
  id: string;
  type: ActionType;
  filePath?: string;
  content: string;
}

// Number of LLM round-trips attempted for a single user turn: the initial attempt
// plus up to 2 retries, mirroring createErrorFeedbackTracker's default maxRounds=2.
const MAX_ROUNDS = 3;

export function createGenerationService(deps: GenerationServiceDeps) {
  // Globally-unique per message. A previous in-memory counter (msg-1, msg-2, …) reset to 0 on every
  // process restart and was shared across projects, so persisted ids collided — the chatMessage
  // insert then failed with a unique-constraint error, aborting the turn and dropping history.
  const nextMessageId = () => `msg-${randomUUID()}`;
  const turnLock = createProjectTurnLock();

  return {
    history(projectId: string): Promise<WorkspaceChatMessage[]> {
      return deps.chatHistory.listMessages(projectId);
    },
    async listWorkspaceFiles(projectId: string): Promise<Array<{ path: string; content: string }>> {
      const containerId = deps.getContainerId(projectId);
      return deps.readWorkspaceFiles ? deps.readWorkspaceFiles(containerId) : [];
    },
    async *runTurn(input: {
      projectId: string;
      prompt: string;
      agentMode?: WorkspaceAgentMode;
      actor?: PlatformUser;
    }): AsyncIterable<ChatStreamEvent> {
      const releaseTurn = await turnLock.acquire(input.projectId);
      try {
        const agentMode: WorkspaceAgentMode = input.agentMode === "plan" ? "plan" : "build";
        const userMessage: WorkspaceChatMessage = {
          id: nextMessageId(),
          projectId: input.projectId,
          role: "user",
          content: input.prompt,
          agentMode,
          artifactActionIds: [],
          commitSha: null,
          tokenUsage: null,
          createdAt: new Date().toISOString()
        };
        await deps.chatHistory.appendMessage(userMessage);

        const containerId = deps.getContainerId(input.projectId);
        const apiKey = deps.getApiKey(input.projectId);
        const baseCommit =
          agentMode === "build" ? await deps.workspaceGuard.prepare(input.projectId) : null;
        // Read the CURRENT files from the container so the AI edits live code (preserving
        // existing features) instead of rewriting from the static template. Falls back to
        // the template when the reader is absent or the container has no source yet.
        const liveFiles = deps.readContextFiles
          ? await deps.readContextFiles(containerId).catch(() => [])
          : [];
        const actionIds: string[] = [];
        const turnActions: WorkspaceChatAction[] = [];
        const deferredMigrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
        let assistantText = "";
        let turnFailed = false;
        let prompt = input.prompt;

        roundLoop: for (let round = 0; round < MAX_ROUNDS; round += 1) {
          const parser = createMessageParser();
          const openActions = new Map<string, OpenAction>();
          let roundFailed = false;

          const contextFiles =
            liveFiles.length > 0 ? liveFiles : selectContextFiles(deps.template, prompt);
          const promptInput = {
            template: deps.template,
            contextFiles,
            rollingSummary: (await deps.chatHistory.getSummary(input.projectId))?.summary ?? null
          };
          const systemPrompt =
            agentMode === "plan"
              ? buildPlanSystemPrompt(promptInput)
              : buildSystemPrompt(promptInput);

          const priorMessages = (await deps.chatHistory.listMessages(input.projectId))
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: message.content
            }));

          const chatInput = {
            apiKey,
            systemPrompt,
            messages: [...priorMessages, { role: "user" as const, content: prompt }]
          };
          const governedPrompt = [
            systemPrompt,
            "\nConversation:",
            ...chatInput.messages.map((message) => `${message.role}: ${message.content}`)
          ].join("\n");
          const tokens = deps.governedCompletion
            ? resolveGovernedCompletion(deps.governedCompletion, input, governedPrompt, agentMode)
            : deps.llmClient.streamChat(chatInput);

          if (agentMode === "plan") {
            for await (const token of tokens) {
              assistantText += token;
              yield { type: "token", content: token };
            }
            break roundLoop;
          }

          for await (const token of tokens) {
            for (const event of parser.push(token)) {
              if (event.type === "text") {
                assistantText += event.content;
                yield { type: "token", content: event.content };
                continue;
              }
              if (event.type === "action_start") {
                openActions.set(event.actionId, {
                  id: event.actionId,
                  type: event.actionType,
                  filePath: event.filePath,
                  content: ""
                });
                yield {
                  type: "action_start",
                  actionId: event.actionId,
                  actionType: event.actionType,
                  label: event.filePath ?? ""
                };
                continue;
              }
              if (event.type === "action_chunk") {
                const action = openActions.get(event.actionId);
                if (action) action.content += event.content;
                yield { type: "action_chunk", actionId: event.actionId, content: event.content };
                continue;
              }
              if (event.type === "action_end") {
                const open = openActions.get(event.actionId);
                if (!open) continue;
                actionIds.push(open.id);

                const editParsed = open.type === "edit" ? parseEditBody(open.content) : null;
                const runnable: RunnableAction =
                  open.type === "file"
                    ? {
                        id: open.id,
                        type: "file",
                        filePath: open.filePath ?? "",
                        content: open.content
                      }
                    : open.type === "edit"
                      ? {
                          id: open.id,
                          type: "edit",
                          filePath: open.filePath ?? "",
                          find: editParsed?.find ?? "",
                          replace: editParsed?.replace ?? ""
                        }
                      : open.type === "shell"
                        ? { id: open.id, type: "shell", command: open.content }
                        : {
                            id: open.id,
                            type: "migration",
                            name: open.filePath ?? open.id,
                            sql: open.content
                          };

                if (runnable.type === "migration") {
                  deferredMigrations.push(runnable);
                  continue;
                }
                let result: ActionResult;
                try {
                  result = await deps.actionRunner.runAction({
                    containerId,
                    projectId: input.projectId,
                    template: deps.template,
                    action: runnable
                  });
                } catch (error) {
                  result = {
                    ok: false,
                    error: (error as Error).message,
                    stdout: "",
                    stderr: "",
                    exitCode: -1
                  };
                }
                deps.onAudit?.({
                  action: "generation.action_executed",
                  projectId: input.projectId,
                  metadata: { actionId: open.id, type: open.type, ok: result.ok }
                });
                const actionLabel = describeRunnable(runnable);
                turnActions.push({
                  id: open.id,
                  type: open.type,
                  label: actionLabel,
                  ok: result.ok
                });
                const preview = buildActionPreview(runnable, result);
                yield {
                  type: "action_result",
                  actionId: open.id,
                  actionType: open.type,
                  label: actionLabel,
                  ok: result.ok,
                  ...preview
                };

                if (!result.ok) {
                  if (round < MAX_ROUNDS - 1 && deps.errorFeedback.shouldRetry(open.id)) {
                    deps.errorFeedback.recordFailure(open.id);
                    prompt = deps.errorFeedback.buildRetryPrompt(runnable, result);
                    roundFailed = true;
                  } else {
                    yield {
                      type: "error",
                      message: `Action failed after retries: ${result.error}. Command: ${describeRunnable(runnable)}`
                    };
                    turnFailed = true;
                    roundFailed = true;
                  }
                } else {
                  deps.errorFeedback.reset(open.id);
                }
              }
            }
          }

          for (const event of parser.flush()) {
            if (event.type === "text") {
              assistantText += event.content;
              yield { type: "token", content: event.content };
            }
          }

          if (turnFailed || !roundFailed) {
            break roundLoop;
          }
          // roundFailed but a retry is still allowed: loop again with the updated `prompt`.
        }

        const assistantMessage: WorkspaceChatMessage = {
          id: nextMessageId(),
          projectId: input.projectId,
          role: "assistant",
          content: assistantText,
          agentMode,
          artifactActionIds: actionIds,
          actions: turnActions,
          commitSha: null,
          tokenUsage: null,
          createdAt: new Date().toISOString()
        };

        if (!turnFailed && agentMode === "build") {
          try {
            await deps.workspaceGuard.validate(input.projectId);
            const sha = await deps.commitAllChanges(input.projectId, `AI: ${input.prompt}`);
            if (deferredMigrations.length > 0) {
              const migrationResult = await deps.actionRunner.runMigrationBatch({
                containerId,
                projectId: input.projectId,
                actions: deferredMigrations,
                commitSha: sha
              });
              for (const migration of deferredMigrations) {
                turnActions.push({
                  id: migration.id,
                  type: migration.type,
                  label: migration.name,
                  ok: migrationResult.ok
                });
                yield {
                  type: "action_result",
                  actionId: migration.id,
                  actionType: migration.type,
                  label: migration.name,
                  ok: migrationResult.ok,
                  ...(migrationResult.ok
                    ? { body: clipActionText(migration.sql) }
                    : { error: migrationResult.error })
                };
              }
              if (!migrationResult.ok) throw new Error(migrationResult.error);
            }
            assistantMessage.commitSha = sha;
            await deps.checkpoints?.createCheckpoint({
              projectId: input.projectId,
              tag: `checkpoint/${sha.slice(0, 12)}`,
              commitSha: sha,
              label: input.prompt.slice(0, 120)
            });
            deps.onAudit?.({
              action: "generation.commit_created",
              projectId: input.projectId,
              metadata: { sha }
            });
            await deps.chatHistory.appendMessage(assistantMessage);
            yield { type: "commit", sha };
          } catch (error) {
            if (baseCommit) await deps.workspaceGuard.restore(input.projectId, baseCommit);
            await deps.chatHistory.appendMessage(assistantMessage);
            yield { type: "error", message: (error as Error).message };
          }
        } else {
          if (turnFailed && baseCommit) {
            await deps.workspaceGuard.restore(input.projectId, baseCommit);
          }
          await deps.chatHistory.appendMessage(assistantMessage);
        }

        yield { type: "done" };
      } finally {
        releaseTurn();
      }
    }
  };
}
