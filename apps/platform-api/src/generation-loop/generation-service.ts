import type { WorkspaceAgentMode, WorkspaceChatMessage, WorkspaceChatAction } from "@evcp/types";
import { createMessageParser } from "./message-parser";
import type { ActionResult, RunnableAction } from "./action-runner";
import { selectContextFiles } from "./context-selector";
import { buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import type { PlatformUser } from "../platform-services";
import type { ChatStreamEvent } from "./generation-types";
import { resolveGovernedCompletion } from "./governed-completion";
import {
  asTokenChunks,
  buildSkillLoadFeedback,
  runShellStreaming,
  validateBuild
} from "./generation-stream-helpers";
import {
  buildActionPreview,
  clipActionText,
  describeRunnable,
  toRunnableAction
} from "./generation-action-utils";
import { createProjectTurnLock } from "./project-turn-lock";
import type { GenerationServiceDeps, OpenAction } from "./generation-service-types";
import { createAssistantChatMessage, createUserChatMessage } from "./generation-message-factory";
import { resolveGovernedTurnContext } from "./generation-turn-context";
import { restoreWorkspaceCommit } from "./workspace-restore";
import { runInterimChecks } from "./turn-checks";

export type { ActionActionType, ChatStreamEvent } from "./generation-types";
export type { GenerationServiceDeps } from "./generation-service-types";

// LLM round-trips per user turn (initial + up to 2 retries), also used for build self-heal.
const MAX_ROUNDS = 3;

export function createGenerationService(deps: GenerationServiceDeps) {
  const turnLock = createProjectTurnLock();

  return {
    history(projectId: string): Promise<WorkspaceChatMessage[]> {
      return deps.chatHistory.listMessages(projectId);
    },
    restoreToCommit(projectId: string, commitSha: string): Promise<void> {
      return restoreWorkspaceCommit(
        { lock: turnLock, guard: deps.workspaceGuard, chatHistory: deps.chatHistory },
        projectId,
        commitSha
      );
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
      approvedPlan?: string;
    }): AsyncIterable<ChatStreamEvent> {
      const releaseTurn = await turnLock.acquire(input.projectId);
      try {
        const agentMode: WorkspaceAgentMode = input.agentMode === "plan" ? "plan" : "build";
        const userMessage = createUserChatMessage(input.projectId, input.prompt, agentMode);
        await deps.chatHistory.appendMessage(userMessage);

        const containerId = deps.getContainerId(input.projectId);
        const apiKey = deps.getApiKey(input.projectId);
        const baseCommit =
          agentMode === "build" ? await deps.workspaceGuard.prepare(input.projectId) : null;
        // Edit the container's CURRENT files (preserve features) instead of the static template.
        const liveFiles = deps.readContextFiles
          ? await deps.readContextFiles(containerId).catch(() => [])
          : [];
        // Uncapped path listing so the model knows what exists beyond the few contents shown.
        const liveTree = (await deps.listWorkspaceTree?.(containerId).catch(() => [])) ?? [];
        const templatePaths = (deps.template.files ?? []).map((file) => file.path);
        const knownPaths = new Set(liveTree.length ? liveTree : templatePaths);
        const actionIds: string[] = [];
        const turnActions: WorkspaceChatAction[] = [];
        const deferredMigrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
        let assistantText = "";
        let turnFailed = false;
        let buildValidated = false;
        let prompt = input.prompt;
        const governed = await resolveGovernedTurnContext(deps, input);
        // First build (no successful AI commit yet): no mid-turn bug scans — see below.
        const firstBuild =
          agentMode === "build" &&
          !(await deps.chatHistory.listMessages(input.projectId)).some((message) => message.commitSha);

        roundLoop: for (let round = 0; round < MAX_ROUNDS; round += 1) {
          const parser = createMessageParser();
          const openActions = new Map<string, OpenAction>();
          let roundFailed = false;
          let roundHadFileAction = false;
          const roundWrites: Array<{ path: string; content: string }> = [];

          const contextFiles =
            liveFiles.length > 0 ? liveFiles : selectContextFiles(deps.template, prompt);
          const promptInput = {
            template: deps.template,
            contextFiles,
            // knownPaths, not the turn-start tree: retry rounds must see files written in
            // earlier rounds, or the model recreates them and hits the overwrite guard.
            fileTree: [...knownPaths],
            rollingSummary: (await deps.chatHistory.getSummary(input.projectId))?.summary ?? null,
            availableSkills: governed?.availableSkills,
            knowledgeExcerpts: governed?.knowledgeExcerpts,
            productSpec: governed?.productSpec,
            approvedPlan: input.approvedPlan
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
                  yield {
                    type: "action_result",
                    actionId: open.id,
                    actionType: "skill",
                    label: `Loaded skill: ${open.name ?? ""}`,
                    ok: Boolean(instruction)
                  };
                  prompt = buildSkillLoadFeedback(open.name ?? "", instruction);
                  roundFailed = true;
                  continue;
                }
                const runnable: RunnableAction = toRunnableAction(open);

                if (runnable.type === "migration") {
                  deferredMigrations.push(runnable);
                  continue;
                }
                let result: ActionResult;
                try {
                  result =
                    runnable.type === "shell"
                      ? yield* runShellStreaming(
                          deps.actionRunner,
                          deps.template,
                          containerId,
                          input.projectId,
                          runnable,
                          open.id
                        )
                      : await deps.actionRunner.runAction({
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
                  if (runnable.type === "file" || runnable.type === "edit") {
                    knownPaths.add(runnable.filePath);
                    roundWrites.push({
                      path: runnable.filePath,
                      content: runnable.type === "file" ? runnable.content : runnable.replace
                    });
                  }
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

          // Follow-up builds: write checks + build self-heal per round (first builds compile
          // once after the loop instead — no mid-turn bug scans).
          if (!turnFailed && !roundFailed && agentMode === "build" && !firstBuild) {
            const check = await runInterimChecks(deps, containerId, input.projectId, {
              roundWrites, knownPaths, roundHadFileAction, finalRound: round >= MAX_ROUNDS - 1
            });
            if (check.feedbackPrompt) { prompt = check.feedbackPrompt; roundFailed = true; }
            if (check.errorMessage) { turnFailed = true; yield { type: "error", message: check.errorMessage }; }
            if (check.validated) buildValidated = true;
          }

          if (turnFailed || !roundFailed) {
            break roundLoop;
          }
          // roundFailed but a retry is still allowed: loop again with the updated `prompt`.
        }

        // ONE compile at code-complete whenever no clean round already validated (every
        // first build; also follow-up turns that wrote nothing, e.g. inspecting an
        // already-broken workspace). Message is readable + bug-box classified (pinned prefix).
        if (!turnFailed && agentMode === "build" && !buildValidated) {
          const buildError = await validateBuild(deps.workspaceGuard, input.projectId);
          buildValidated = true;
          if (buildError) {
            yield { type: "error", message: `Compile check failed: ${buildError.slice(0, 300)}` };
            // First builds still commit for inspection; any other turn keeps its work
            // UNCOMMITTED — pre-existing brokenness is not this turn's doing, no rollback.
            if (!firstBuild) turnFailed = true;
          }
        }

        const assistantMessage = createAssistantChatMessage({
          projectId: input.projectId,
          content: assistantText,
          agentMode,
          artifactActionIds: actionIds,
          actions: turnActions
        });

        if (!turnFailed && agentMode === "build") {
          try {
            const migrationArtifacts = await deps.actionRunner.syncMigrationArtifacts?.({
              containerId,
              projectId: input.projectId,
              actions: deferredMigrations
            });
            if (migrationArtifacts && !migrationArtifacts.ok) {
              throw new Error(migrationArtifacts.error);
            }
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
          // Failed turns KEEP their work: the auto-debug turn repairs the files in place
          // (seconds) instead of recreating a rolled-back app from scratch (minutes). The
          // pre-turn commit stays a restore point — rollback is the ⏪ button's job now.
          await deps.chatHistory.appendMessage(assistantMessage);
        }

        yield { type: "done" };
      } finally {
        releaseTurn();
      }
    }
  };
}
