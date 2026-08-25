import type { WorkspaceChatMessage } from "@evcp/types";

import type { RunnableAction } from "./action-runner-types";
import type { PiGenerationServiceDeps } from "./generation-service-types";

export async function finalizePiCandidate(input: {
  deps: Pick<PiGenerationServiceDeps, "actionRunner" | "checkpoints" | "chatHistory">;
  signal: AbortSignal;
  containerId: string;
  projectId: string;
  migrations: Array<Extract<RunnableAction, { type: "migration" }>>;
  candidateSha: string;
  assistant: WorkspaceChatMessage;
  prompt: string;
  assertCurrent?: () => Promise<void>;
  markIrreversible(): void;
}): Promise<void> {
  input.signal.throwIfAborted();
  let irreversible = false;
  let lateCancellation = false;
  const markIrreversible = () => {
    irreversible = true;
    input.markIrreversible();
  };
  const observeCancellation = () => {
    if (!input.signal.aborted) return;
    if (!irreversible) input.signal.throwIfAborted();
    lateCancellation = true;
  };

  await input.assertCurrent?.();
  const migrated = await input.deps.actionRunner.runMigrationBatch({
    containerId: input.containerId,
    projectId: input.projectId,
    actions: input.migrations,
    commitSha: input.candidateSha
  });
  if (migrated.databaseMigrationOutcome !== "not_applied") markIrreversible();
  observeCancellation();
  if (!migrated.ok) throw new Error(migrated.error);

  if (input.deps.checkpoints) {
    await input.assertCurrent?.();
    markIrreversible();
    await input.deps.checkpoints.createCheckpoint({
      projectId: input.projectId,
      tag: `checkpoint/${input.candidateSha.slice(0, 12)}`,
      commitSha: input.candidateSha,
      label: input.prompt.slice(0, 120)
    });
    observeCancellation();
  }

  input.assistant.commitSha = input.candidateSha;
  await input.assertCurrent?.();
  markIrreversible();
  await input.deps.chatHistory.appendMessage(input.assistant);
  observeCancellation();
  if (lateCancellation) throw new DOMException("The operation was aborted", "AbortError");
}
