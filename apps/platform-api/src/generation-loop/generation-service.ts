import type { WorkspaceAgentMode, WorkspaceChatMessage, WorkspaceChatAction } from "@evcp/types";
import type { GoldenTemplate } from "../workspace-orchestrator/template";
import { createMessageParser, type ActionType } from "./message-parser";
import type { LlmCompletionClient } from "./llm-client";
import type { ChatHistoryStore } from "./chat-history-store";
import type { ActionRunner, RunnableAction } from "./action-runner";
import type { createErrorFeedbackTracker } from "./error-feedback";
import { selectContextFiles } from "./context-selector";
import { buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";

export type ActionActionType = "file" | "edit" | "shell" | "migration";

export type ChatStreamEvent =
  | { type: "token"; content: string }
  // Emitted when an action begins so the UI can show a live "in progress" row (shimmer).
  | { type: "action_start"; actionId: string; actionType: ActionActionType; label: string }
  // Emitted when the action finishes. Carries a preview the UI can expand: find/replace for an
  // edit (rendered as a diff), body for file/shell/migration, or error text on failure.
  | {
      type: "action_result";
      actionId: string;
      actionType: ActionActionType;
      label: string;
      ok: boolean;
      find?: string;
      replace?: string;
      body?: string;
      error?: string;
    }
  | { type: "commit"; sha: string }
  | { type: "error"; message: string }
  | { type: "done" };

// Preview payloads can be large (whole files); cap them so the SSE stream stays lean.
const PREVIEW_MAX = 4000;
function clip(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}\n… (truncated)` : text;
}

export interface GenerationServiceDeps {
  llmClient: LlmCompletionClient;
  chatHistory: ChatHistoryStore;
  actionRunner: ActionRunner;
  errorFeedback: ReturnType<typeof createErrorFeedbackTracker>;
  template: GoldenTemplate;
  getApiKey: (projectId: string) => string;
  getContainerId: (projectId: string) => string;
  readContextFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  readWorkspaceFiles?: (containerId: string) => Promise<Array<{ path: string; content: string }>>;
  commitAllChanges: (projectId: string, message: string) => Promise<string>;
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

function describeRunnable(action: RunnableAction): string {
  if (action.type === "shell") return action.command;
  if (action.type === "file" || action.type === "edit") return action.filePath;
  return action.name;
}

// An <action type="edit"> body carries an aider/opencode-style search/replace block:
//   <<<<<<< SEARCH
//   {exact snippet to find}
//   =======
//   {replacement}
//   >>>>>>> REPLACE
// A malformed body yields an empty find, which the runner rejects as not_found (never a
// silent whole-file overwrite).
function parseEditBody(body: string): { find: string; replace: string } {
  // The trailing newlines around the REPLACE body are optional so a DELETE (empty REPLACE, i.e.
  // `=======` immediately followed by `>>>>>>> REPLACE`) still parses instead of yielding an empty
  // find that the runner rejects.
  const match = body.match(
    /<{3,}\s*SEARCH\s*\n([\s\S]*?)\n={3,}[^\n]*\n?([\s\S]*?)\n?>{3,}\s*REPLACE/
  );
  if (match) return { find: match[1], replace: match[2] };
  return { find: "", replace: "" };
}

export function createGenerationService(deps: GenerationServiceDeps) {
  let messageCounter = 0;
  const nextMessageId = () => {
    messageCounter += 1;
    return `msg-${messageCounter}`;
  };

  return {
    history(projectId: string): WorkspaceChatMessage[] {
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
    }): AsyncIterable<ChatStreamEvent> {
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
      deps.chatHistory.appendMessage(userMessage);

      const containerId = deps.getContainerId(input.projectId);
      const apiKey = deps.getApiKey(input.projectId);
      // Read the CURRENT files from the container so the AI edits live code (preserving
      // existing features) instead of rewriting from the static template. Falls back to
      // the template when the reader is absent or the container has no source yet.
      const liveFiles = deps.readContextFiles
        ? await deps.readContextFiles(containerId).catch(() => [])
        : [];
      const actionIds: string[] = [];
      const turnActions: WorkspaceChatAction[] = [];
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
          rollingSummary: deps.chatHistory.getSummary(input.projectId)?.summary ?? null
        };
        const systemPrompt =
          agentMode === "plan" ? buildPlanSystemPrompt(promptInput) : buildSystemPrompt(promptInput);

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

        if (agentMode === "plan") {
          for await (const token of deps.llmClient.streamChat(chatInput)) {
            assistantText += token;
            yield { type: "token", content: token };
          }
          break roundLoop;
        }

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
              const actionLabel = describeRunnable(runnable);
              turnActions.push({ id: open.id, type: open.type, label: actionLabel, ok: result.ok });
              // Build an expandable preview: a diff for edits, otherwise the written body / command
              // / SQL; the error text when the action failed.
              const preview: { find?: string; replace?: string; body?: string; error?: string } =
                {};
              if (!result.ok) {
                preview.error = result.error;
              } else if (runnable.type === "edit") {
                preview.find = clip(runnable.find);
                preview.replace = clip(runnable.replace);
              } else if (runnable.type === "file") {
                preview.body = clip(runnable.content);
              } else if (runnable.type === "shell") {
                preview.body = clip(
                  `$ ${runnable.command}\n${result.ok ? result.stdout : ""}`.trim()
                );
              } else if (runnable.type === "migration") {
                preview.body = clip(runnable.sql);
              }
              yield {
                type: "action_result",
                actionId: open.id,
                actionType: open.type,
                label: actionLabel,
                ok: result.ok,
                ...preview
              };

              if (!result.ok) {
                if (deps.errorFeedback.shouldRetry(open.id)) {
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
        const sha = await deps.commitAllChanges(input.projectId, `AI: ${input.prompt}`);
        assistantMessage.commitSha = sha;
        deps.onAudit?.({
          action: "generation.commit_created",
          projectId: input.projectId,
          metadata: { sha }
        });
        deps.chatHistory.appendMessage(assistantMessage);
        yield { type: "commit", sha };
      } else {
        deps.chatHistory.appendMessage(assistantMessage);
      }

      yield { type: "done" };
    }
  };
}
