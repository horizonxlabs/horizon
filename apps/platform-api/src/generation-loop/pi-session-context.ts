import type { WorkspaceAgentMode, WorkspaceChatMessage } from "@evcp/types";
import type { AssistantMessage, Model, Usage } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ModelRuntime,
  type ResourceLoader,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";

const SESSION_CWD = "/horizon-workspace";
const PLAN_TOOL_NAMES = [
  "read_workspace_file",
  "list_workspace_files",
  "load_governed_skill"
] as const;

export type CreateHorizonPiSessionInput = {
  modelRuntime: ModelRuntime;
  model: Model<string>;
  turnId: string;
  mode: WorkspaceAgentMode;
  systemPrompt: string;
  customTools: ToolDefinition[];
  messages: WorkspaceChatMessage[];
  currentMessageId?: string;
};

export async function createHorizonPiSession(
  input: CreateHorizonPiSessionInput
): Promise<AgentSession> {
  const sessionManager = SessionManager.inMemory(SESSION_CWD, { id: `pi_${input.turnId}` });
  for (const message of input.messages) {
    if (message.id === input.currentMessageId || message.role === "system") continue;
    sessionManager.appendMessage(toPiMessage(message, input.model));
  }

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2, baseDelayMs: 250 },
    enableAnalytics: false,
    packages: [],
    extensions: [],
    skills: [],
    prompts: [],
    themes: []
  });
  const activeTools =
    input.mode === "plan"
      ? PLAN_TOOL_NAMES.filter((name) => input.customTools.some((tool) => tool.name === name))
      : input.customTools.map((tool) => tool.name);
  const { session } = await createAgentSession({
    cwd: SESSION_CWD,
    modelRuntime: input.modelRuntime,
    model: input.model,
    thinkingLevel: "medium",
    noTools: "all",
    tools: [...activeTools],
    customTools: input.customTools,
    resourceLoader: createEmptyResourceLoader(input.systemPrompt),
    sessionManager,
    settingsManager
  });
  return session;
}

function createEmptyResourceLoader(systemPrompt: string): ResourceLoader {
  const extensions = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime()
  };
  return {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => undefined,
    reload: async () => undefined
  };
}

function toPiMessage(message: WorkspaceChatMessage, model: Model<string>) {
  const timestamp = Date.parse(message.createdAt);
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  if (message.role === "user") {
    return { role: "user" as const, content: message.content, timestamp: safeTimestamp };
  }
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: message.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: message.tokenUsage
      ? usage(message.tokenUsage.promptTokens, message.tokenUsage.completionTokens)
      : usage(0, 0),
    stopReason: "stop" as const,
    timestamp: safeTimestamp
  } satisfies AssistantMessage;
}

function usage(input: number, output: number): Usage {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  };
}
