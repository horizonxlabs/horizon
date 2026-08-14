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
import { buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import type { RunnableAction } from "./action-runner-types";
import { filterAgentWorkspaceFiles, safeToolError } from "./pi-tool-policy";
import { restoreWorkspaceCommit } from "./workspace-restore";

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
  const mode: WorkspaceAgentMode = input.agentMode === "plan" ? "plan" : "build";
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
    mode === "plan" ? buildPlanSystemPrompt(systemInput) : buildSystemPrompt(systemInput);
  const baseCommit = mode === "build" ? await deps.workspaceGuard.prepare(input.projectId) : null;
  const timeoutSignal = AbortSignal.timeout(limits.turnTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const migrations: Array<Extract<RunnableAction, { type: "migration" }>> = [];
  let toolCalls = 0;
  let assistantText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let session: Awaited<ReturnType<typeof createHorizonPiSession>> | undefined;
  let queue: PiSessionEventQueue | undefined;
  const actionIds: string[] = [];
  const actions: WorkspaceChatAction[] = [];
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
    queue = new PiSessionEventQueue(session);
    for await (const event of queue.prompt(input.prompt)) {
      collectEvent(event);
      for (const adapted of adaptPiEvent(event)) yield adapted;
    }
    ensureNoFailedTool(failedTool);

    if (mode === "build") {
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
          ensureNoFailedTool(failedTool);
        }
      }
      if (validationFailure) throw validationFailure;
    }

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
    if (baseCommit) await deps.workspaceGuard.restore(input.projectId, baseCommit);
    const assistant = createAssistantChatMessage({
      projectId: input.projectId,
      content: assistantText,
      agentMode: mode,
      artifactActionIds: actionIds,
      actions,
      tokenUsage: { promptTokens, completionTokens }
    });
    await deps.chatHistory.appendMessage(assistant);
    yield { type: "error", message: safeToolError(error) };
  } finally {
    queue?.close();
    session?.dispose();
  }
  yield { type: "done" };

  function collectEvent(event: AgentSessionEvent): void {
    const delta = assistantTextDelta(event);
    if (delta) assistantText += delta;
    if (event.type === "message_end" && event.message.role === "assistant") {
      const text = event.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text) assistantText = text;
      promptTokens += event.message.usage.input;
      completionTokens += event.message.usage.output;
    }
    if (event.type === "tool_execution_end") {
      const details = event.result?.details as HorizonPiToolDetails | undefined;
      if (!details) return;
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

function ensureNoFailedTool(details: HorizonPiToolDetails | undefined): void {
  if (details) throw new Error(details.error ?? `${details.label} failed`);
}
