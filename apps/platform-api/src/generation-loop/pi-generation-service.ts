import type { WorkspaceAgentMode, WorkspaceChatAction } from "@evcp/types";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import { selectContextFiles } from "./context-selector";
import { createAssistantChatMessage, createUserChatMessage } from "./generation-message-factory";
import type { GenerationService, PiGenerationServiceDeps } from "./generation-service-types";
import type { ChatStreamEvent } from "./generation-types";
import { createHorizonPiRuntime } from "./pi-provider";
import { createProjectTurnLock } from "./project-turn-lock";
import { adaptPiEvent, assistantTextDelta } from "./pi-event-adapter";
import { resolvePiAgentLimits } from "./pi-limits";
import { createHorizonPiSession } from "./pi-session-context";
import { PiSessionEventQueue } from "./pi-session-event-queue";
import { createHorizonPiTools, type HorizonPiToolDetails } from "./pi-tools";
import { buildAutoSystemPrompt, buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import type { RunnableAction } from "./action-runner-types";
import { filterAgentWorkspaceFiles, safeToolError } from "./pi-tool-policy";
import { restoreWorkspaceCommit } from "./workspace-restore";
import { collectRoundIssues } from "./turn-checks";

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
  if (mode === "build") await deps.workspaceGuard.prepare(input.projectId);
  const timeoutSignal = AbortSignal.timeout(limits.turnTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const migrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
  let toolCalls = 0;
  let assistantText = "";
  let currentAssistantDeltaText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let session: Awaited<ReturnType<typeof createHorizonPiSession>> | undefined;
  let queue: PiSessionEventQueue | undefined;
  let detachSessionAbort: (() => void) | undefined;
  const actionIds: string[] = [];
  const actions: WorkspaceChatAction[] = [];
  const writtenPaths = new Set<string>();
  let failedTool: HorizonPiToolDetails | undefined;

  try {
    const { modelRuntime, model } = await createHorizonPiRuntime({
      executor: deps.governedAiExecutor,
      actor: input.actor,
      projectId: input.projectId,
      scenario: "frontend_coding",
      turnId: userMessage.id,
      maxModelRounds: limits.maxModelRounds
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
      for (const adapted of adaptPiEvent(event)) yield adapted;
    }
    signal.throwIfAborted();
    ensureNoFailedTool(failedTool);

    if (mode === "build") {
      const writeIssues = await collectPiWriteIssues(deps, containerId, writtenPaths, limits);
      if (writeIssues.length > 0) {
        for await (const event of queue.prompt(buildWriteFeedback(writeIssues))) {
          collectEvent(event);
          for (const adapted of adaptPiEvent(event)) yield adapted;
        }
        signal.throwIfAborted();
        ensureNoFailedTool(failedTool);
        const remainingIssues = await collectPiWriteIssues(deps, containerId, writtenPaths, limits);
        if (remainingIssues.length > 0) throw new Error(remainingIssues.join("\n"));
      }

      let validationFailure: unknown;
      for (let attempt = 0; attempt <= limits.validationRetries; attempt += 1) {
        try {
          await deps.workspaceGuard.validate(input.projectId);
          validationFailure = undefined;
          break;
        } catch (error) {
          validationFailure = error;
          if (attempt >= limits.validationRetries) break;
          for await (const event of queue.prompt(buildValidationFeedback(error))) {
            collectEvent(event);
            for (const adapted of adaptPiEvent(event)) yield adapted;
          }
          signal.throwIfAborted();
          ensureNoFailedTool(failedTool);
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
      tokenUsage: { promptTokens, completionTokens }
    });
    if (mode === "build") {
      const synced = await deps.actionRunner.syncMigrationArtifacts?.({
        containerId,
        projectId: input.projectId,
        actions: migrations
      });
      if (synced && !synced.ok) throw new Error(synced.error);
      const sha = await deps.commitAllChanges(input.projectId, `AI: ${input.prompt}`);
      const migrated = await deps.actionRunner.runMigrationBatch({
        containerId,
        projectId: input.projectId,
        actions: migrations,
        commitSha: sha
      });
      if (!migrated.ok) throw new Error(migrated.error);
      await deps.checkpoints?.createCheckpoint({
        projectId: input.projectId,
        tag: `checkpoint/${sha.slice(0, 12)}`,
        commitSha: sha,
        label: input.prompt.slice(0, 120)
      });
      assistant.commitSha = sha;
      await deps.chatHistory.appendMessage(assistant);
      yield { type: "commit", sha };
    } else {
      await deps.chatHistory.appendMessage(assistant);
    }
  } catch (error) {
    await session?.abort().catch(() => undefined);
    const errorMessage = safeToolError(error);
    const persistedContent = input.signal?.aborted
      ? assistantText
      : `${assistantText}\n\n⚠️ ${errorMessage}`;
    const assistant = createAssistantChatMessage({
      projectId: input.projectId,
      content: persistedContent,
      agentMode: mode,
      artifactActionIds: actionIds,
      actions,
      tokenUsage: { promptTokens, completionTokens }
    });
    await deps.chatHistory.appendMessage(assistant);
    yield { type: "error", message: errorMessage };
  } finally {
    detachSessionAbort?.();
    queue?.close();
    session?.dispose();
  }
  yield { type: "done" };

  function collectEvent(event: AgentSessionEvent): void {
    if (event.type === "message_start" && event.message.role === "assistant") {
      currentAssistantDeltaText = "";
    }
    const delta = assistantTextDelta(event);
    if (delta) {
      assistantText += delta;
      currentAssistantDeltaText += delta;
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
    }
    if (event.type === "tool_execution_end") {
      const details = event.result?.details as HorizonPiToolDetails | undefined;
      if (!details) return;
      if (
        details.ok &&
        !event.isError &&
        (details.actionType === "file" || details.actionType === "edit")
      ) {
        writtenPaths.add(details.label);
        if (failedTool?.label === details.label) failedTool = undefined;
      }
      actionIds.push(event.toolCallId);
      actions.push({
        id: event.toolCallId,
        type: details.actionType,
        label: details.label,
        ok: details.ok && !event.isError
      });
      if (!details.ok || event.isError) failedTool = details;
    }
  }
}

async function collectPiWriteIssues(
  deps: PiGenerationServiceDeps,
  containerId: string,
  writtenPaths: Set<string>,
  limits: ReturnType<typeof resolvePiAgentLimits>
): Promise<string[]> {
  if (!writtenPaths.size || !deps.readWorkspaceFiles) return [];
  const files = filterAgentWorkspaceFiles(await deps.readWorkspaceFiles(containerId));
  assertFileLimits(files, limits.maxFileBytes);
  const knownPaths = new Set(files.map((file) => file.path));
  const writes = files.filter((file) => writtenPaths.has(file.path));
  return collectRoundIssues(deps, containerId, writes, knownPaths);
}

function assertFileLimits(
  files: Array<{ path: string; content: string }>,
  maxFileBytes: number
): void {
  const oversized = files.find((file) => Buffer.byteLength(file.content, "utf8") > maxFileBytes);
  if (oversized) throw new Error(`workspace file '${oversized.path}' exceeds the file-size limit`);
}

function buildValidationFeedback(error: unknown): string {
  const message = safeToolError(error)
    .replaceAll(String.fromCodePoint(27), "")
    .replace(/\[[0-9;]*m/g, "")
    .slice(0, 4_000);
  return `Validation failed. Fix only these errors with Horizon tools, then stop:\n${message}`;
}

function buildWriteFeedback(issues: string[]): string {
  return `The files were saved, but Horizon detected these write issues. Repair only these issues in place; do not recreate working files:\n${issues.join("\n")}`;
}

function ensureNoFailedTool(details: HorizonPiToolDetails | undefined): void {
  if (details) throw new Error(details.error ?? `${details.label} failed`);
}
