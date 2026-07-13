import type {
  GuardrailResult,
  PlatformProject,
  PlatformUser,
  PrdVersion,
  WorkspacePromptResult
} from "../platform-services";
import type { GovernedAiExecutor, AiExecutionEvidence } from "./execution-service";
import type { WorkspaceRepositoryBackedService } from "../persistence/workspace-repositories";

type WorkspacePromptBody = WorkspacePromptResult & { aiEvidence: AiExecutionEvidence };
type WorkspaceApi = Pick<WorkspaceRepositoryBackedService, "blockPrompt" | "submitPrompt">;

export async function handlePersistedWorkspacePrompt(input: {
  actor: PlatformUser;
  project: PlatformProject;
  baseline: PrdVersion;
  prompt: string;
  requestId: string;
  executor: Pick<GovernedAiExecutor, "execute">;
  workspace: WorkspaceApi;
  audit: (event: { actorId: string; action: string; resourceId: string; severity: "info" | "warning"; metadata: Record<string, unknown> }) => Promise<unknown>;
}): Promise<{ status: 200 | 201; body: WorkspacePromptBody }> {
  const execution = await input.executor.execute(input.actor, {
    scenario: "frontend_coding",
    projectId: input.project.id,
    prompt: input.prompt,
    requestId: input.requestId,
    requestedTokens: 120
  });
  const guardrail = guardrailForExecution(execution.evidence);
  if (execution.status === "blocked" || execution.status === "failed") {
    const blocked = await input.workspace.blockPrompt(input.actor, {
      project: input.project,
      baseline: input.baseline,
      prompt: input.prompt,
      guardrail
    });
    await input.audit({
      actorId: input.actor.id,
      action: "workspace.prompt.blocked",
      resourceId: blocked.task.id,
      severity: "warning",
      metadata: { projectId: input.project.id, executionId: execution.evidence.id, reason: execution.evidence.failureReason }
    });
    return { status: 200, body: { ...blocked, aiEvidence: execution.evidence } };
  }
  const result = await input.workspace.submitPrompt(input.actor, {
    project: input.project,
    baseline: input.baseline,
    prompt: input.prompt,
    guardrail,
    route: { providerId: execution.evidence.providerId, model: execution.evidence.model },
    tokensUsed: execution.evidence.tokensUsed
  });
  await input.audit({
    actorId: input.actor.id,
    action: "workspace.prompt.accepted",
    resourceId: result.task.id,
    severity: "info",
    metadata: { projectId: input.project.id, executionId: execution.evidence.id, previewVersion: result.preview.version, tokensUsed: execution.evidence.tokensUsed }
  });
  return { status: 201, body: { ...result, aiEvidence: execution.evidence } };
}

function guardrailForExecution(evidence: AiExecutionEvidence): GuardrailResult {
  const blocked = evidence.status === "blocked" || evidence.status === "failed";
  return { decision: blocked ? "block" : "allow", severity: blocked ? "high" : "info", eventId: evidence.id };
}
