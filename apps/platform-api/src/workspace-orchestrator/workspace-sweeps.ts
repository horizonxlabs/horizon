import type { WorkspaceOrchestrator } from "./orchestrator";
import { startIdleSweep } from "./idle-sweep";
import { startWarmPoolSweep } from "./warm-pool-sweep";

type WorkspaceServices = { workspaceOrchestrator: WorkspaceOrchestrator };

export function startWorkspaceIdleSweep(
  services: WorkspaceServices,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  return startIdleSweep(services.workspaceOrchestrator, opts);
}

export function startWorkspaceSweeps(services: WorkspaceServices): Array<{ stop(): void }> {
  return [
    startWorkspaceIdleSweep(services),
    startWarmPoolSweep({
      reconcile: () => services.workspaceOrchestrator.reconcileWarmPool(),
      ensureCapacity: () => services.workspaceOrchestrator.ensureWarmPoolCapacity()
    })
  ];
}
