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
import { resolveGovernedCompletion, type StreamChunk } from "./governed-completion";
import { asTokenChunks, buildErrorFeedback, buildSkillLoadFeedback, runShellStreaming, validateBuild, type GovernedContext } from "./generation-stream-helpers";
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
  // Private-server path: governed route/guardrails/quota/evidence. LLM client is the memory-test fallback.
  governedCompletion?: (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
    prompt: string;
    requestId: string;
  }) => AsyncIterable<StreamChunk>;
  /** Governed skills (names + descriptions, instructions on demand) and knowledge excerpts for the prompt. */
  resolveGovernedContext?: (input: { actor: PlatformUser; projectId: string; scenario: AiScenario }) => Promise<GovernedContext>;
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
  name?: string;
  content: string;
}

// LLM round-trips per user turn (initial + up to 2 retries), also used for build self-heal.
const MAX_ROUNDS = 3;

export function createGenerationService(deps: GenerationServiceDeps) {
  // Globally-unique per message (a shared in-memory counter reset on restart and collided).
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
        // Edit the container's CURRENT files (preserve features) instead of the static template.
        const liveFiles = deps.readContextFiles
          ? await deps.readContextFiles(containerId).catch(() => [])
          : [];
        const actionIds: string[] = [];
        const turnActions: WorkspaceChatAction[] = [];
        const deferredMigrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
        let assistantText = "";
        let turnFailed = false;
        let buildValidated = false;
        let prompt = input.prompt;
        const governed = input.actor && deps.resolveGovernedContext ? await deps.resolveGovernedContext({ actor: input.actor, projectId: input.projectId, scenario: "frontend_coding" }).catch(() => undefined) : undefined;

        roundLoop: for (let round = 0; round < MAX_ROUNDS; round += 1) {
          const parser = createMessageParser();
          const openActions = new Map<string, OpenAction>();
          let roundFailed = false;
          let roundHadFileAction = false;

          const contextFiles =
            liveFiles.length > 0 ? liveFiles : selectContextFiles(deps.template, prompt);
          const promptInput = {
            template: deps.template,
            contextFiles,
            rollingSummary: (await deps.chatHistory.getSummary(input.projectId))?.summary ?? null,
            availableSkills: governed?.availableSkills,
            knowledgeExcerpts: governed?.knowledgeExcerpts,
            productSpec: governed?.productSpec
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

          const chatInput = { apiKey, systemPrompt, messages: [...priorMessages, { role: "user" as const, content: prompt }] };
          const governedPrompt = [systemPrompt, "\nConversation:", ...chatInput.messages.map((message) => `${message.role}: ${message.content}`)].join("\n");
          const tokens = deps.governedCompletion
            ? resolveGovernedCompletion(deps.governedCompletion, input, governedPrompt, agentMode)
            : asTokenChunks(deps.llmClient.streamChat(chatInput));

          if (agentMode === "plan") {
            for await (const chunk of tokens) {
              if (chunk.kind === "reasoning") {
                yield { type: "reasoning", content: chunk.text };
                continue;
              }
              assistantText += chunk.text;
              yield { type: "token", content: chunk.text };
            }
            break roundLoop;
          }

          for await (const chunk of tokens) {
            if (chunk.kind === "reasoning") {
              yield { type: "reasoning", content: chunk.text };
              continue;
            }
            for (const event of parser.push(chunk.text)) {
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
                  name: event.name,
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
                if (open.type === "file" || open.type === "edit") roundHadFileAction = true;

                if (open.type === "skill") {
                  // Load the skill's full instructions on demand and feed them into the next round.
                  const instruction = governed?.skillInstructions[open.name ?? ""];
                  yield { type: "action_result", actionId: open.id, actionType: "skill", label: `Loaded skill: ${open.name ?? ""}`, ok: Boolean(instruction) };
                  prompt = buildSkillLoadFeedback(open.name ?? "", instruction);
                  roundFailed = true;
                  continue;
                }
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
                  result = runnable.type === "shell"
                    ? yield* runShellStreaming(deps.actionRunner, deps.template, containerId, input.projectId, runnable, open.id)
                    : await deps.actionRunner.runAction({ containerId, projectId: input.projectId, template: deps.template, action: runnable });
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

          // Build-error self-heal: validate a clean file-changing round; feed errors back to fix (opencode-style).
          if (!turnFailed && !roundFailed && agentMode === "build" && roundHadFileAction) {
            const buildError = await validateBuild(deps.workspaceGuard, input.projectId);
            if (buildError && round < MAX_ROUNDS - 1) { prompt = buildErrorFeedback(buildError); roundFailed = true; }
            else if (buildError) { turnFailed = true; yield { type: "error", message: `Build still failing after fixes: ${buildError.replace(/\[[0-9;]*m/g, "").slice(0, 300)}` }; }
            else buildValidated = true;
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
            // Final gate: validate unless a self-heal round already confirmed the build.
            if (!buildValidated) await deps.workspaceGuard.validate(input.projectId);
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
