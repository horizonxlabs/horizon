import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { PlatformUser } from "../platform-services";
import type { RunnableAction } from "./action-runner-types";
import type { PiGenerationServiceDeps } from "./generation-service-types";
import type { PiAgentLimits } from "./pi-limits";
import { filterAgentWorkspaceFiles } from "./pi-tool-policy";
import { createHorizonPiTools } from "./pi-tools";
import { assertFileLimits } from "./turn-checks";

// Assembles the per-turn Horizon tool set together with its budgets (tool calls, image
// calls) and the governed image-generation closure. Extracted from pi-generation-service
// (400-line ratchet) so the counters live beside the wiring they guard.
export function createPiTurnTools(args: {
  deps: PiGenerationServiceDeps;
  actor: PlatformUser;
  projectId: string;
  containerId: string;
  limits: PiAgentLimits;
  signal: AbortSignal;
  skillInstructions: Readonly<Record<string, string>>;
  migrations: Array<Extract<RunnableAction, { type: "migration" }>>;
  turnId: string;
}): { tools: ToolDefinition[]; toolCallCount(): number } {
  const { deps, limits } = args;
  let toolCalls = 0;
  let imageCalls = 0;
  const tools = createHorizonPiTools({
    projectId: args.projectId,
    containerId: args.containerId,
    template: deps.template,
    actionRunner: deps.actionRunner,
    readWorkspaceFiles: async (id) => {
      const files = filterAgentWorkspaceFiles(await (deps.readWorkspaceFiles?.(id) ?? []));
      assertFileLimits(files, limits.maxFileBytes);
      return files;
    },
    skillInstructions: args.skillInstructions,
    migrationBuffer: args.migrations,
    signal: args.signal,
    limits,
    nextToolCall() {
      toolCalls += 1;
      if (toolCalls > limits.maxToolCalls) throw new Error("Pi tool call budget exceeded");
    },
    listWorkspaceTree: deps.listWorkspaceTree,
    nextImageCall() {
      imageCalls += 1;
      if (imageCalls > limits.maxImageCalls)
        throw new Error(`Pi image generation budget exceeded (${limits.maxImageCalls} per turn)`);
    },
    // No executor image support (memory/test mode) leaves generateImage undefined and the
    // tool fails soft with its "not configured" guidance — builds continue without images.
    ...(deps.governedAiExecutor.generateImage
      ? {
          generateImage: async (request: { prompt: string; aspectRatio?: string }) => {
            const result = await deps.governedAiExecutor.generateImage!(args.actor, {
              projectId: args.projectId,
              requestId: `img_${args.turnId}_${imageCalls}`,
              ...request
            });
            return {
              status: result.status,
              base64: result.base64,
              mimeType: result.mimeType,
              failureReason: result.evidence?.failureReason
            };
          }
        }
      : {}),
    onAudit: deps.onAudit
  });
  return { tools, toolCallCount: () => toolCalls };
}
