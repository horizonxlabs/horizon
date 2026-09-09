import type { ChatStreamEvent } from "./generation-types";

function isRecoverableTurnStartupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /docker engine exec-create failed \(409\).*container.*is not running/i.test(message) ||
    /Vault secret operation failed \((?:408|429|500|502|503|504)\)/i.test(message)
  );
}

export async function* runTurnWithStartupRecovery(input: {
  prepare: () => Promise<void>;
  run: () => AsyncIterable<ChatStreamEvent>;
}): AsyncIterable<ChatStreamEvent> {
  let recoveryAttempted = false;
  let emitted = false;
  while (true) {
    try {
      await input.prepare();
      for await (const event of input.run()) {
        emitted = true;
        yield event;
      }
      return;
    } catch (error) {
      if (recoveryAttempted || emitted || !isRecoverableTurnStartupError(error)) throw error;
      // Replaying is safe before the first model/tool event. Preparation reconciles stale
      // container ownership; transient Vault failures get one fresh read.
      recoveryAttempted = true;
    }
  }
}
