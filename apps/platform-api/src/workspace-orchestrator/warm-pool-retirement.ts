import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WorkspaceWarmSlotStore } from "./warm-pool-types";
import { physicalResourceKey } from "./warm-pool-config";
import { workspaceVolumeName } from "./workspace-lifecycle";

/** Retired keys are never reused. Current-slot cleanup stays under the existing slot fences. */
export async function reconcileRetiredWarmPreparations(options: {
  store: WorkspaceWarmSlotStore;
  deps: WorkspaceOrchestratorDeps;
}): Promise<void> {
  const { store, deps } = options;
  for (const intent of await store.preparations.list()) {
    const current = (await store.list()).find((slot) => slot.resourceKey === intent.resourceKey);
    if (current) {
      // Ready is only reachable after all creates have returned and their receipts are durable.
      if (current.state === "ready" || current.state === "claiming") {
        await store.preparations.remove(intent.resourceKey);
      }
      continue;
    }
    // Read after the slot inventory: completion persists runtime ownership before retiring a slot.
    const runtimeKeys = new Set(
      ((await deps.runtimeRecords?.list()) ?? []).map(({ record }) => physicalResourceKey(record))
    );
    if (runtimeKeys.has(intent.resourceKey)) {
      await store.preparations.remove(intent.resourceKey);
      continue;
    }
    try {
      const container = await deps.docker.inspectContainer(`evcp-ws-${intent.resourceKey}`);
      if (container) await deps.docker.removeContainer(container.containerId);
      const results = await Promise.allSettled([
        deps.postgres.releaseSchema(intent.resourceKey),
        deps.objectStorage.releaseBucket(intent.resourceKey),
        deps.docker.removeVolume(workspaceVolumeName(intent.resourceKey)),
        deps.llmGateway.revokeVirtualKeysForResource(intent.resourceKey)
      ]);
      if (results.some((result) => result.status === "rejected")) continue;
      // Never forget an interrupted create: the server may commit after this sweep.
      if (intent.settled) await store.preparations.remove(intent.resourceKey);
    } catch {
      // Exact non-secret generation intent remains durable for the next reconciliation.
    }
  }
}
