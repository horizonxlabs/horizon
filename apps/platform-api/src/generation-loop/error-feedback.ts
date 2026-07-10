import type { ActionResult, RunnableAction } from "./action-runner";

export function createErrorFeedbackTracker(maxRounds = 2) {
  const failureCounts = new Map<string, number>();

  return {
    shouldRetry(actionId: string): boolean {
      return (failureCounts.get(actionId) ?? 0) < maxRounds;
    },
    recordFailure(actionId: string): void {
      failureCounts.set(actionId, (failureCounts.get(actionId) ?? 0) + 1);
    },
    reset(actionId: string): void {
      failureCounts.delete(actionId);
    },
    buildRetryPrompt(action: RunnableAction, result: Extract<ActionResult, { ok: false }>): string {
      const command =
        action.type === "shell"
          ? action.command
          : action.type === "file" || action.type === "edit"
            ? action.filePath
            : action.name;
      // Include `result.error` — guards (drift/locked-file) put their instruction there with empty
      // stdout/stderr, so dropping it left the model blind to WHY it failed and it just retried the
      // same rejected whole-file write. The error line carries the "use an <action type=edit>" steer.
      return `The previous action (${action.type}: ${command}) failed with exit code ${result.exitCode}.\nerror:\n${result.error}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\nFix the issue and try again.`;
    }
  };
}
