import type { WorkspaceWarmPoolOptions } from "./warm-pool";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import type { ProvisioningSecretAttempt } from "./secret-store";
import { workspaceContainerName, workspacePhysicalKey } from "./runtime-location";
import { isWarmContainerCompatible } from "./warm-container-compatibility";
import {
  MANAGED_WORKSPACE_SECRET_NAMES,
  waitForPreviewReady,
  workspaceSecretEntries
} from "./workspace-lifecycle";

/** Repair an incomplete durable handoff before its retained encrypted preparation is discarded. */
export async function repairOwnedWarmSecrets(
  options: Pick<WorkspaceWarmPoolOptions, "deps" | "codec">,
  slot: WarmWorkspaceSlot,
  ownership: ProvisioningSecretAttempt
): Promise<void> {
  const { deps } = options;
  const projectId = slot.claimProjectId;
  if (!projectId || !deps.runtimeRecords) return;
  await ownership.assertOwned();
  const snapshots = await deps.runtimeRecords.list();
  const owner = snapshots.find(
    ({ record }) =>
      record.projectId === projectId && workspacePhysicalKey(record) === slot.resourceKey
  );
  if (!owner) return;
  try {
    await deps.secrets.adoptProvisioning(projectId, ownership);
    const current = await deps.secrets.resolveEnv(projectId);
    const names = [...MANAGED_WORKSPACE_SECRET_NAMES];
    // Complete bundles may contain valid newer rotations. They must never be replaced by preparation.
    if (names.every((name) => current[name])) {
      await ownership.assertOwned();
      return;
    }
    const assertRuntimeOwner = async () => {
      await ownership.assertOwned();
      const owners = (await deps.runtimeRecords!.list()).filter(
        ({ record }) =>
          workspacePhysicalKey(record) === slot.resourceKey ||
          (slot.containerId && record.containerId === slot.containerId)
      );
      if (
        owners.length !== 1 ||
        owners[0].record.projectId !== projectId ||
        owners[0].record.state !== "running" ||
        owners[0].record.containerId !== slot.containerId ||
        owners[0].llmGatewayKeyId !== slot.llmGatewayKeyId
      )
        throw new Error("runtime ownership changed");
      await ownership.assertOwned();
    };
    await assertRuntimeOwner();
    const found = await deps.docker.inspectContainer(workspaceContainerName(owner.record));
    if (
      !slot.containerId ||
      !slot.secretPayload ||
      !slot.llmGatewayKeyId ||
      !found?.running ||
      found.containerId !== slot.containerId ||
      !isWarmContainerCompatible(found, slot.resourceKey, deps.image ?? "evcp/workspace-next:1")
    )
      throw new Error("retained allocation cannot be verified");
    const prepared = options.codec.open(slot.secretPayload);
    const entries = workspaceSecretEntries(found.env);
    if (
      Object.keys(prepared).length !== names.length ||
      entries.length !== names.length ||
      names.some(
        (name) =>
          !prepared[name] ||
          entries.filter(([key, value]) => key === name && value === prepared[name]).length !== 1
      )
    )
      throw new Error("retained managed bundle cannot be verified");
    await waitForPreviewReady(deps.docker, found.containerId);
    await assertRuntimeOwner();
    await deps.secrets.repairForProvisioning(projectId, prepared, ownership);
    await assertRuntimeOwner();
  } catch {
    // Keep the slot, container, and encrypted bundle available for a fenced retry, with no values exposed.
    throw new Error("owned warm workspace secret repair is incomplete; retry reconciliation");
  }
}

export async function repairProjectWarmSecrets(
  options: WorkspaceWarmPoolOptions,
  projectId: string,
  ownership: ProvisioningSecretAttempt
): Promise<void> {
  const slot = (await options.store.list()).find(
    (candidate) => candidate.claimProjectId === projectId
  );
  if (slot) await repairOwnedWarmSecrets(options, slot, ownership);
}
