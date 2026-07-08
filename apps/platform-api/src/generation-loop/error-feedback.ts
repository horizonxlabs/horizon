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
      const command = action.type === "shell" ? action.command : action.type === "file" ? action.filePath : action.name;
      return `The previous action (${action.type}: ${command}) failed with exit code ${result.exitCode}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\nFix the issue and try again.`;
    }
  };
}
