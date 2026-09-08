import type { PlatformUser } from "../platform-services";
import type { WorkspaceAgentMode, WorkspaceChatMessage } from "@evcp/types";

import { selectContextFiles, selectContextPaths, selectLiveContextFiles } from "./context-selector";
import type { PiGenerationServiceDeps } from "./generation-service-types";
import { selectRecentPiHistory } from "./pi-context-memory";
import { filterAgentWorkspaceFiles } from "./pi-tool-policy";
import { buildAutoSystemPrompt, buildPlanSystemPrompt, buildSystemPrompt } from "./system-prompt";
import { assertFileLimits } from "./turn-checks";

export async function preparePiTurnContext(input: {
  deps: PiGenerationServiceDeps;
  projectId: string;
  prompt: string;
  actor: PlatformUser;
  mode: WorkspaceAgentMode;
  currentMessage: WorkspaceChatMessage;
  approvedPlan?: string;
  maxFileBytes: number;
}) {
  const { deps } = input;
  const history = await deps.chatHistory.listRecentMessages(input.projectId, 11);
  const historyMessages = selectRecentPiHistory(history, input.currentMessage.id).length;
  const containerId = deps.getContainerId(input.projectId);
  const governed = deps.resolveGovernedContext
    ? await deps.resolveGovernedContext({
        actor: input.actor,
        projectId: input.projectId,
        scenario: "frontend_coding"
      })
    : { availableSkills: [], skillInstructions: {}, knowledgeExcerpts: [] };
  const fileTree = deps.listWorkspaceTree ? await deps.listWorkspaceTree(containerId) : [];
  const contextPaths = selectContextPaths(fileTree, input.prompt);
  const liveFiles = filterAgentWorkspaceFiles(
    deps.readContextFiles ? await deps.readContextFiles(containerId, contextPaths) : []
  );
  assertFileLimits(liveFiles, input.maxFileBytes);
  const contextFiles = liveFiles.length
    ? selectLiveContextFiles(liveFiles, input.prompt)
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
    input.mode === "plan"
      ? buildPlanSystemPrompt(systemInput)
      : input.mode === "auto"
        ? buildAutoSystemPrompt(systemInput)
        : buildSystemPrompt(systemInput);

  return {
    containerId,
    contextFileCount: contextFiles.length,
    governed,
    history,
    historyMessages,
    systemPrompt
  };
}
