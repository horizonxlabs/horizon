import type { WorkspaceChatMessage } from "@evcp/types";
import type { GoldenTemplate } from "../workspace-orchestrator/template";
import { createMessageParser, type ActionType } from "./message-parser";
import type { LlmCompletionClient } from "./llm-client";
import type { ChatHistoryStore } from "./chat-history-store";
import type { ActionRunner, RunnableAction } from "./action-runner";
import type { createErrorFeedbackTracker } from "./error-feedback";
import { selectContextFiles } from "./context-selector";
import { buildSystemPrompt } from "./system-prompt";

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "action_result"; actionId: string; ok: boolean }
  | { type: "commit"; sha: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface GenerationServiceDeps {
  llmClient: LlmCompletionClient;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  errorFeedback: ReturnType<typeof createErrorFeedbackTracker>;
  template: GoldenTemplate;
  getApiKey: (projectId: string) => string;
  getContainerId: (projectId: string) => string;
  commitAllChanges: (projectId: string, message: string) => Promise<string>;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
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

function describeRunnable(action: RunnableAction): string {
  if (action.type === "shell") return action.command;
  if (action.type === "file") return action.filePath;
  return action.name;
}

export function createGenerationService(deps: GenerationServiceDeps) {
  let messageCounter = 0;
  const nextMessageId = () => {
    messageCounter += 1;
    return `msg-${messageCounter}`;
  };

  return {
    async *runTurn(input: { projectId: string; prompt: string }): AsyncIterable<ChatStreamEvent> {
      const userMessage: WorkspaceChatMessage = {
        id: nextMessageId(),
        projectId: input.projectId,
        role: "user",
        content: input.prompt,
        artifactActionIds: [],
        commitSha: null,
        tokenUsage: null,
        createdAt: new Date().toISOString()
      };
      deps.chatHistory.appendMessage(userMessage);

      const containerId = deps.getContainerId(input.projectId);
      const apiKey = deps.getApiKey(input.projectId);
      const actionIds: string[] = [];
      let assistantText = "";
      let turnFailed = false;
      let prompt = input.prompt;

      roundLoop: for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const parser = createMessageParser();
        const openActions = new Map<string, OpenAction>();
        let roundFailed = false;

        const contextFiles = selectContextFiles(deps.template, prompt);
        const systemPrompt = buildSystemPrompt({
          template: deps.template,
          contextFiles,
          rollingSummary: deps.chatHistory.getSummary(input.projectId)?.summary ?? null
        });

        const priorMessages = deps.chatHistory
          .listMessages(input.projectId)
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

        for await (const token of deps.llmClient.streamChat(chatInput)) {
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
              continue;
            }
            if (event.type === "action_chunk") {
              const action = openActions.get(event.actionId);
              if (action) action.content += event.content;
              continue;
            }
            if (event.type === "action_end") {
              const open = openActions.get(event.actionId);
              if (!open) continue;
              actionIds.push(open.id);

              const runnable: RunnableAction =
                open.type === "file"
                  ? { id: open.id, type: "file", filePath: open.filePath ?? "", content: open.content }
                  : open.type === "shell"
                    ? { id: open.id, type: "shell", command: open.content }
                    : { id: open.id, type: "migration", name: open.filePath ?? open.id, sql: open.content };

              const result = await deps.actionRunner.runAction({
                containerId,
                projectId: input.projectId,
                template: deps.template,
                action: runnable
              });
              deps.onAudit?.({
                action: "generation.action_executed",
                projectId: input.projectId,
                metadata: { actionId: open.id, type: open.type, ok: result.ok }
              });
              yield { type: "action_result", actionId: open.id, ok: result.ok };

              if (!result.ok) {
                deps.errorFeedback.recordFailure(open.id);
                if (!deps.errorFeedback.shouldRetry(open.id)) {
                  yield {
                    type: "error",
                    message: `Action failed after retries: ${result.error}. Command: ${describeRunnable(runnable)}`
                  };
                  turnFailed = true;
                  roundFailed = true;
                } else {
                  prompt = deps.errorFeedback.buildRetryPrompt(runnable, result);
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
        artifactActionIds: actionIds,
        commitSha: null,
        tokenUsage: null,
        createdAt: new Date().toISOString()
      };

      if (!turnFailed) {
        const sha = await deps.commitAllChanges(input.projectId, `AI: ${input.prompt}`);
        assistantMessage.commitSha = sha;
        deps.onAudit?.({ action: "generation.commit_created", projectId: input.projectId, metadata: { sha } });
        deps.chatHistory.appendMessage(assistantMessage);
        yield { type: "commit", sha };
      } else {
        deps.chatHistory.appendMessage(assistantMessage);
      }

      yield { type: "done" };
    }
  };
}
