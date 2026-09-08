import type { PiGenerationServiceDeps } from "./generation-service-types";
import { refreshRollingSummary } from "./pi-context-memory";
import { safeToolError } from "./pi-tool-policy";

export async function recordPiTurnObservability(input: {
  deps: Pick<PiGenerationServiceDeps, "chatHistory" | "onAudit">;
  projectId: string;
  status: "succeeded" | "failed";
  modelRounds: number;
  toolCalls: number;
  compactions: number;
  promptTokens: number;
  completionTokens: number;
  contextFiles: number;
  historyMessages: number;
}): Promise<void> {
  try {
    await refreshRollingSummary(input.deps.chatHistory, input.projectId);
  } catch (error) {
    emitAudit(input.deps.onAudit, {
      action: "pi_summary_refresh",
      projectId: input.projectId,
      metadata: { ok: false, error: safeToolError(error) }
    });
  }

  emitAudit(input.deps.onAudit, {
    action: "pi_turn",
    projectId: input.projectId,
    metadata: {
      status: input.status,
      modelRounds: input.modelRounds,
      toolCalls: input.toolCalls,
      compactions: input.compactions,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      contextFiles: input.contextFiles,
      historyMessages: input.historyMessages
    }
  });
}

function emitAudit(
  onAudit: PiGenerationServiceDeps["onAudit"],
  event: Parameters<NonNullable<PiGenerationServiceDeps["onAudit"]>>[0]
): void {
  try {
    onAudit?.(event);
  } catch {
    // Observability must never change workspace transaction or chat delivery semantics.
  }
}
