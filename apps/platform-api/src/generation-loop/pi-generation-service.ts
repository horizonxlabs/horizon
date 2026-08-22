import type {
  WorkspaceAgentMode,
  WorkspaceChatAction,
  WorkspaceChatMessage,
  WorkspaceChatTurnPart
} from "@evcp/types";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import { selectContextFiles } from "./context-selector";
import { createAssistantChatMessage, createUserChatMessage } from "./generation-message-factory";
import type { GenerationService, PiGenerationServiceDeps } from "./generation-service-types";
import type { ChatStreamEvent } from "./generation-types";
import { createHorizonPiRuntime } from "./pi-provider";
import { createProjectTurnLock } from "./project-turn-lock";
import {
  adaptPiEvent,
  assistantReasoningDelta,
  assistantTextDelta,
  collectToolExecutionEnd
} from "./pi-event-adapter";
import { resolvePiAgentLimits } from "./pi-limits";
import { createHorizonPiSession } from "./pi-session-context";
import { PiSessionEventQueue } from "./pi-session-event-queue";
import { persistPiTurnErrorAssistant } from "./pi-turn-error-persistence";
import * as turnFeedback from "./pi-turn-feedback";
import { finalizePiCandidate } from "./pi-turn-finalization";
import { releasePiTurnSnapshot } from "./pi-turn-snapshot-lifecycle";
import { createHorizonPiTools, type HorizonPiToolDetails } from "./pi-tools";
import { buildAutoSystemPrompt, buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import type { RunnableAction } from "./action-runner-types";
import { filterAgentWorkspaceFiles, safeToolError } from "./pi-tool-policy";
import { restoreWorkspaceCommit } from "./workspace-restore";
import { assertFileLimits, collectPiWriteIssues } from "./turn-checks";
import { reduceTurnPart } from "./turn-parts";

export function createPiGenerationService(deps: PiGenerationServiceDeps): GenerationService {
  const turnLock = createProjectTurnLock();
  const limits = resolvePiAgentLimits(deps.limits);
  return {
    history: (projectId) => deps.chatHistory.listMessages(projectId),
    restoreToCommit: (projectId, commitSha) =>
      restoreWorkspaceCommit(
        { lock: turnLock, guard: deps.workspaceGuard, chatHistory: deps.chatHistory },
        projectId,
        commitSha
      ),
    async listWorkspaceFiles(projectId) {
      return deps.readWorkspaceFiles?.(deps.getContainerId(projectId)) ?? [];
    },
    async *runTurn(input): AsyncIterable<ChatStreamEvent> {
      const release = await turnLock.acquire(input.projectId);
      try {
        yield* runLockedTurn(deps, limits, input);
      } finally {
        release();
      }
    }
  };
}

async function* runLockedTurn(
  deps: PiGenerationServiceDeps,
  limits: ReturnType<typeof resolvePiAgentLimits>,
  input: Parameters<GenerationService["runTurn"]>[0]
): AsyncIterable<ChatStreamEvent> {
  if (!input.actor) {
    yield { type: "error", message: "Authenticated Creator actor is required" };
    yield { type: "done" };
    return;
  }
  const mode: WorkspaceAgentMode =
    input.agentMode === "plan" || input.agentMode === "build" ? input.agentMode : "auto";
  const userMessage = createUserChatMessage(input.projectId, input.prompt, mode);
  await deps.chatHistory.appendMessage(userMessage);
  const history = await deps.chatHistory.listMessages(input.projectId);
  const containerId = deps.getContainerId(input.projectId);
  const governed = deps.resolveGovernedContext
    ? await deps.resolveGovernedContext({
        actor: input.actor,
        projectId: input.projectId,
        scenario: "frontend_coding"
      })
    : { availableSkills: [], skillInstructions: {}, knowledgeExcerpts: [] };
  const liveFiles = filterAgentWorkspaceFiles(
    deps.readContextFiles ? await deps.readContextFiles(containerId) : []
  );
  const fileTree = deps.listWorkspaceTree ? await deps.listWorkspaceTree(containerId) : [];
  assertFileLimits(liveFiles, limits.maxFileBytes);
  const contextFiles = liveFiles.length
    ? liveFiles
    : selectContextFiles(deps.template, input.prompt);
  const systemInput = {
    template: deps.template,
    contextFiles,
    fileTree,
    rollingSummary: (await deps.chatHistory.getSummary(input.projectId))?.summary ?? null,
    availableSkills: governed.availableSkills,
    knowledgeExcerpts: governed.knowledgeExcerpts,
    productSpec: governed.productSpec,
    approvedPlan: input.approvedPlan
  };
  const systemPrompt =
    mode === "plan"
      ? buildPlanSystemPrompt(systemInput)
      : mode === "auto"
        ? buildAutoSystemPrompt(systemInput)
        : buildSystemPrompt(systemInput);
  const mutationCapable = mode !== "plan";
  const timeoutSignal = AbortSignal.timeout(limits.turnTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const migrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
  let toolCalls = 0;
  let assistantText = "";
  let turnParts: WorkspaceChatTurnPart[] = [];
  let currentAssistantDeltaText = "";
  let currentRoundReasoningChars = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let session: Awaited<ReturnType<typeof createHorizonPiSession>> | undefined;
  let queue: PiSessionEventQueue | undefined;
  let detachSessionAbort: (() => void) | undefined;
  const actionIds: string[] = [];
  const actions: WorkspaceChatAction[] = [];
  const writtenPaths = new Set<string>();
  let failedTool: HorizonPiToolDetails | undefined;
  let preparedSnapshotToken: string | undefined;
  let snapshotLeaseTimer: ReturnType<typeof setInterval> | undefined;
  let snapshotLeaseError: Error | undefined;
  let assistantMessage: WorkspaceChatMessage | undefined;
  let candidateSha: string | undefined;
  let irreversibleFinalizationMayHaveTakenEffect = false;
  let commitEventEmitted = false;
  let rollbackRecoveryRequired = false;

  function trackTurnEvent(event: ChatStreamEvent): ChatStreamEvent {
    turnParts = reduceTurnPart(turnParts, event);
    if (assistantMessage) assistantMessage.parts = turnParts;
    return event;
  }

  try {
    if (mutationCapable) {
      preparedSnapshotToken = await deps.workspaceGuard.prepare(input.projectId, containerId);
      if (deps.workspaceGuard.renewSnapshot) {
        snapshotLeaseTimer = setInterval(() => {
          void deps.workspaceGuard
            .renewSnapshot?.(input.projectId, containerId, preparedSnapshotToken!)
            .catch((error) => {
              snapshotLeaseError = error instanceof Error ? error : new Error(String(error));
            });
        }, 10_000);
        snapshotLeaseTimer.unref?.();
      }
    }
    signal.throwIfAborted();
    const { modelRuntime, model } = await createHorizonPiRuntime({
      executor: deps.governedAiExecutor,
      actor: input.actor,
      projectId: input.projectId,
      scenario: "frontend_coding",
      turnId: userMessage.id,
      maxModelRounds: limits.maxModelRounds,
      modelRoundTimeoutMs: limits.modelRoundTimeoutMs
    });
    const tools = createHorizonPiTools({
      projectId: input.projectId,
      containerId,
      template: deps.template,
      actionRunner: deps.actionRunner,
      readWorkspaceFiles: async (id) => {
        const files = filterAgentWorkspaceFiles(await (deps.readWorkspaceFiles?.(id) ?? []));
        assertFileLimits(files, limits.maxFileBytes);
        return files;
      },
      skillInstructions: governed.skillInstructions,
      migrationBuffer: migrations,
      signal,
      limits,
      nextToolCall() {
        toolCalls += 1;
        if (toolCalls > limits.maxToolCalls) throw new Error("Pi tool call budget exceeded");
      },
      onAudit: deps.onAudit
    });
    session = await createHorizonPiSession({
      modelRuntime,
      model,
      turnId: userMessage.id,
      mode,
      systemPrompt,
      customTools: tools,
      messages: history,
      currentMessageId: userMessage.id
    });
    const abortSession = () => {
      void session?.abort().catch(() => undefined);
    };
    signal.addEventListener("abort", abortSession, { once: true });
    detachSessionAbort = () => signal.removeEventListener("abort", abortSession);
    if (signal.aborted) abortSession();
    queue = new PiSessionEventQueue(session);
    for await (const event of queue.prompt(input.prompt)) {
      collectEvent(event);
      for (const adapted of adaptPiEvent(event)) yield trackTurnEvent(adapted);
    }
    signal.throwIfAborted();
    for (let attempt = 0; failedTool && attempt < limits.toolFailureRetries; attempt += 1) {
      const priorFailure = failedTool;
      const toolCallsBeforeRetry = toolCalls;
      const feedback = turnFeedback.buildToolFailureFeedback(priorFailure);
      failedTool = undefined;
      for await (const event of queue.prompt(feedback)) {
        collectEvent(event);
        for (const adapted of adaptPiEvent(event)) yield trackTurnEvent(adapted);
      }
      signal.throwIfAborted();
      // A model can ignore the feedback entirely and just narrate instead of calling a
      // tool — no new tool_execution_end event fires, so failedTool never gets set again
      // and this would otherwise read as "resolved" with nothing actually retried.
      if (!failedTool && toolCalls === toolCallsBeforeRetry) {
        failedTool = priorFailure;
      }
    }
    turnFeedback.ensureNoFailedTool(failedTool);
    const snapshotToken = preparedSnapshotToken;
    if (mutationCapable && !snapshotToken) {
      throw new Error("workspace mutation snapshot is unavailable");
    }
    const hasCandidateWorkspaceChanges =
      mutationCapable &&
      (await deps.workspaceGuard.hasChanges(input.projectId, containerId, snapshotToken as string));
    const hasCandidateMutation =
      mutationCapable && (hasCandidateWorkspaceChanges || migrations.length > 0);

    if (hasCandidateMutation) {
      const writeIssues = await collectPiWriteIssues(deps, containerId, writtenPaths, limits);
      if (writeIssues.length > 0) {
        for await (const event of queue.prompt(turnFeedback.buildWriteFeedback(writeIssues))) {
          collectEvent(event);
          for (const adapted of adaptPiEvent(event)) yield trackTurnEvent(adapted);
        }
        signal.throwIfAborted();
        turnFeedback.ensureNoFailedTool(failedTool);
        const remainingIssues = await collectPiWriteIssues(deps, containerId, writtenPaths, limits);
        if (remainingIssues.length > 0) throw new Error(remainingIssues.join("\n"));
      }

      let validationFailure: unknown;
      for (let attempt = 0; attempt <= limits.validationRetries; attempt += 1) {
        try {
          await deps.workspaceGuard.validate(input.projectId, containerId);
          validationFailure = undefined;
          break;
        } catch (error) {
          validationFailure = error;
          if (attempt >= limits.validationRetries) break;
          for await (const event of queue.prompt(turnFeedback.buildValidationFeedback(error))) {
            collectEvent(event);
            for (const adapted of adaptPiEvent(event)) yield trackTurnEvent(adapted);
          }
          signal.throwIfAborted();
          turnFeedback.ensureNoFailedTool(failedTool);
        }
      }
      if (validationFailure) throw validationFailure;
    }

    signal.throwIfAborted();
    const assistant = createAssistantChatMessage({
      projectId: input.projectId,
      content: assistantText,
      agentMode: mode,
      artifactActionIds: actionIds,
      actions,
      parts: turnParts,
      tokenUsage: { promptTokens, completionTokens }
    });
    assistantMessage = assistant;
    if (hasCandidateMutation) {
      const syncMigrationArtifacts = deps.actionRunner.syncMigrationArtifacts;
      if (migrations.length > 0 && !syncMigrationArtifacts) {
        throw new Error("migration artifact sync is required before committing migrations");
      }
      const synced = await syncMigrationArtifacts?.({
        containerId,
        projectId: input.projectId,
        actions: migrations
      });
      if (synced && !synced.ok) throw new Error(synced.error);
      signal.throwIfAborted();
      const hasFinalWorkspaceChanges = await deps.workspaceGuard.hasChanges(
        input.projectId,
        containerId,
        snapshotToken as string
      );
      signal.throwIfAborted();
      if (migrations.length > 0 && !hasFinalWorkspaceChanges) {
        throw new Error(
          "migration artifact sync produced no changes; refusing unversioned migration"
        );
      }
      if (hasFinalWorkspaceChanges) {
        candidateSha = await deps.commitAllChanges(
          input.projectId,
          containerId,
          `AI: ${input.prompt}`
        );
        signal.throwIfAborted();
        const commitEvent = trackTurnEvent({ type: "commit", sha: candidateSha });
        await finalizePiCandidate({
          deps,
          signal,
          containerId,
          projectId: input.projectId,
          migrations,
          candidateSha,
          assistant,
          prompt: input.prompt,
          markIrreversible() {
            irreversibleFinalizationMayHaveTakenEffect = true;
          }
        });
        commitEventEmitted = true;
        yield commitEvent;
      } else {
        await deps.chatHistory.appendMessage(assistant);
      }
    } else {
      await deps.chatHistory.appendMessage(assistant);
    }
  } catch (error) {
    await session?.abort().catch(() => undefined);
    let errorMessage = safeToolError(error);
    const preserveCandidate = irreversibleFinalizationMayHaveTakenEffect && candidateSha;
    if (preparedSnapshotToken && !preserveCandidate) {
      try {
        await deps.workspaceGuard.restoreSnapshot(input.projectId, containerId, preparedSnapshotToken);
      } catch (restoreError) {
        rollbackRecoveryRequired = true;
        errorMessage = `${errorMessage}; workspace rollback failed: ${safeToolError(restoreError)}. Workspace snapshot recovery is required; an operator must inspect the protected recovery state before any new turn.`;
        deps.onAudit?.({
          action: "workspace_snapshot_recovery_required",
          projectId: input.projectId,
          metadata: { ok: false, reason: "rollback_failed" }
        });
      }
    }
    if (preserveCandidate) {
      errorMessage = `Commit ${preserveCandidate} was preserved after finalization: ${errorMessage}`;
    }
    let preservedCommitEvent: ChatStreamEvent | undefined;
    if (preserveCandidate && !commitEventEmitted) {
      commitEventEmitted = true;
      preservedCommitEvent = trackTurnEvent({ type: "commit", sha: preserveCandidate });
    }
    const initialErrorMessage = errorMessage;
    const errorEvent = trackTurnEvent({ type: "error", message: errorMessage });
    errorMessage = await persistPiTurnErrorAssistant({
      chatHistory: deps.chatHistory,
      projectId: input.projectId,
      mode,
      assistantText,
      errorMessage,
      inputAborted: input.signal?.aborted ?? false,
      preservedCommitSha: preserveCandidate || undefined,
      assistantMessage,
      artifactActionIds: actionIds,
      actions,
      parts: turnParts,
      tokenUsage: { promptTokens, completionTokens }
    });
    if (preservedCommitEvent) yield preservedCommitEvent;
    yield errorMessage === initialErrorMessage ? errorEvent : { type: "error", message: errorMessage };
  } finally {
    if (snapshotLeaseTimer) clearInterval(snapshotLeaseTimer);
    if (!rollbackRecoveryRequired) {
      await releasePiTurnSnapshot(deps, input.projectId, containerId, preparedSnapshotToken);
    }
    detachSessionAbort?.();
    queue?.close();
    session?.dispose();
  }
  yield { type: "done" };

  function collectEvent(event: AgentSessionEvent): void {
    if (snapshotLeaseError) {
      throw new Error(`workspace snapshot lease renewal failed: ${snapshotLeaseError.message}`);
    }
    if (event.type === "message_start" && event.message.role === "assistant") {
      currentAssistantDeltaText = "";
      currentRoundReasoningChars = 0;
    }
    const delta = assistantTextDelta(event);
    if (delta) {
      assistantText += delta;
      currentAssistantDeltaText += delta;
    }
    const reasoningDelta = assistantReasoningDelta(event);
    if (reasoningDelta) {
      currentRoundReasoningChars += reasoningDelta.length;
      // A model that never converges on a tool call or a final answer would otherwise
      // keep streaming "thinking" text for the full modelRoundTimeoutMs (up to 5 minutes)
      // before this round even ends — surfacing as the agent silently oscillating between
      // plans. Cut it short here with a specific, actionable error instead.
      if (currentRoundReasoningChars > limits.maxReasoningChars) {
        throw new Error(
          `Pi spent too long deliberating without acting (reasoning budget ${limits.maxReasoningChars} characters exceeded) — commit to one plan and act, or ask one clarifying question`
        );
      }
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
        throw new Error(event.message.errorMessage ?? `Pi model round ${event.message.stopReason}`);
      }
      const text = event.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!currentAssistantDeltaText && text) assistantText += text;
      if (currentAssistantDeltaText && text !== currentAssistantDeltaText) {
        throw new Error("Pi streamed assistant text does not match the completed message");
      }
      promptTokens += event.message.usage.input;
      completionTokens += event.message.usage.output;
      if (
        limits.maxTurnTokens !== undefined &&
        promptTokens + completionTokens > limits.maxTurnTokens
      ) {
        throw new Error(`Pi turn token budget (${limits.maxTurnTokens}) exceeded`);
      }
    }
    if (event.type === "tool_execution_end") {
      failedTool = collectToolExecutionEnd(event, actionIds, actions, writtenPaths, failedTool);
    }
  }
}
