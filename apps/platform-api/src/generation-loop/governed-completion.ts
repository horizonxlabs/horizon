import { randomUUID } from "node:crypto";
import type { WorkspaceAgentMode } from "@evcp/types";
import type { AiScenario, PlatformUser } from "../platform-services";
import type {
  AiExecutionEvidence,
  GovernedAiExecutionResult,
  GovernedAiExecutor
} from "../ai-governance/execution-service";
import type { GenerationServiceDeps } from "./generation-service";

// A chunk from the governed stream: model answer text (fed to the action parser) or chain-of-thought
// reasoning (surfaced as a separate live "thinking" view, never parsed as code).
export type StreamChunk = { kind: "token" | "reasoning"; text: string };

// Adapts the generation-service's call into the streaming governed-completion dependency: maps the
// agent mode to a scenario, mints a request id, and returns the token stream unchanged.
export function resolveGovernedCompletion(
  completion: NonNullable<GenerationServiceDeps["governedCompletion"]>,
  input: { actor?: PlatformUser; projectId: string },
  prompt: string,
  agentMode: WorkspaceAgentMode
): AsyncIterable<StreamChunk> {
  if (!input.actor)
    throw new Error("Governed AI execution requires the authenticated workspace actor");
  return completion({
    actor: input.actor,
    projectId: input.projectId,
    scenario: agentMode === "plan" ? "requirement_analysis" : "frontend_coding",
    prompt,
    requestId: `workspace_chat_${randomUUID()}`
  });
}

// Bridges the governed executor's callback-based streaming (onToken) into an async iterable of
// tokens. The executor still runs the full governed pipeline (route, guardrail, quota, circuit,
// evidence); we forward each delta as it arrives so the caller sees real progress, then surface a
// failed/blocked outcome as a throw once the run settles.
export async function* streamGovernedExecution(
  executor: Pick<GovernedAiExecutor, "execute">,
  input: { actor: PlatformUser; projectId: string; scenario: AiScenario; prompt: string; requestId: string },
  onEvidence?: (evidence: AiExecutionEvidence) => Promise<void> | void
): AsyncIterable<StreamChunk> {
  const queue: StreamChunk[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let failure: unknown;
  let result: GovernedAiExecutionResult | undefined;
  let streamed = "";

  const wake = () => {
    const resolve = notify;
    notify = null;
    resolve?.();
  };

  const run = executor
    .execute(
      input.actor,
      {
        scenario: input.scenario,
        projectId: input.projectId,
        prompt: input.prompt,
        requestId: input.requestId,
        requestedTokens: 1_200
      },
      (delta) => {
        queue.push({ kind: "token", text: delta });
        streamed += delta;
        wake();
      },
      (delta) => {
        queue.push({ kind: "reasoning", text: delta });
        wake();
      }
    )
    .then((value) => {
      result = value;
    })
    .catch((error: unknown) => {
      failure = error;
    })
    .finally(() => {
      finished = true;
      wake();
    });

  for (;;) {
    while (queue.length > 0) yield queue.shift() as StreamChunk;
    if (finished) break;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
  await run;

  if (failure) throw failure;
  const settled = result!;
  await onEvidence?.(settled.evidence);
  const finalText = settled.text ?? "";
  if (settled.status === "blocked" || settled.status === "failed" || !finalText) {
    throw new Error(
      `Governed AI completion unavailable: ${settled.evidence.failureReason ?? settled.status}`
    );
  }
  // A non-streaming provider (e.g. the Anthropic adapter) never fed onToken; emit the full text now
  // so the caller still receives the completion. When tokens did stream, they already carry it.
  if (streamed === "") yield { kind: "token", text: finalText };
}
