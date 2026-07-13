import type { WorkspaceOrchestrator } from "./orchestrator";

export function startIdleSweep(
  orchestrator: Pick<WorkspaceOrchestrator, "stopIdleWorkspaces">,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  const timer = setInterval(() => { void orchestrator.stopIdleWorkspaces().catch(() => undefined); }, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return { stop() { clearInterval(timer); } };
}
