import { buildWarmContainerSpec } from "./docker-engine";
import type { WorkspaceWarmPoolOptions } from "./warm-pool";
import type { WarmWorkspaceSlot } from "./warm-pool-types";
import { cleanupWarmSlotResources } from "./warm-pool-cleanup";
import { createWarmPreparationGuard } from "./warm-pool-preparation-guard";
import {
  maintainWarmSlotOperationLease,
  WarmSlotOperationLeaseLostError,
  warmSlotOperationLease
} from "./warm-pool-operation-lease";
import { preparationErrorCategory, retryDelayMs } from "./warm-pool-retry";
import {
  waitForPreviewReady,
  workspaceVolumeName,
  workspaceWarmVolumeLabels
} from "./workspace-lifecycle";
import { provisionIndependentWorkspaceResources } from "./workspace-provisioning";

export async function prepareWarmSlot(
  options: WorkspaceWarmPoolOptions & {
    now: () => Date;
    operationLeaseMs: number;
    auditPreparation: (
      action: string,
      slotId: string,
      startedAt: number,
      errorCategory?: string
    ) => Promise<void>;
  },
  slot: WarmWorkspaceSlot,
  ownerId: string
): Promise<void> {
  const { now, deps } = options;
  const startedAt = now().getTime();
  const ownership = maintainWarmSlotOperationLease({
    store: options.store,
    slotId: slot.id,
    ownerId,
    now,
    leaseMs: options.operationLeaseMs
  });
  const lease = () => warmSlotOperationLease(ownerId, now, options.operationLeaseMs);
  let ownedSlot = slot;
  let intentCreated = false;
  let ready = false;
  let cleanupComplete = false;
  const guard = createWarmPreparationGuard({
    deps,
    slot,
    store: options.store,
    codec: options.codec,
    ownerId,
    now,
    leaseMs: options.operationLeaseMs,
    ownership,
    recordReceipt: (patch) => {
      ownedSlot = { ...ownedSlot, ...patch };
    }
  });
  try {
    await options.auditPreparation("workspace.pool_prepare_started", slot.id, startedAt);
    await ownership.assertOwned();
    // Persist before any external dispatch; this survives slot rotation and process death.
    await options.store.preparations.create({
      resourceKey: slot.resourceKey,
      slotId: slot.id,
      operationOwner: ownerId
    });
    intentCreated = true;
    const volumeName = workspaceVolumeName(slot.resourceKey);
    const resources = await provisionIndependentWorkspaceResources(guard.deps, {
      projectId: slot.id,
      resourceKey: slot.resourceKey,
      volumeName,
      volumeLabels: workspaceWarmVolumeLabels(slot.id),
      assertOwnership: ownership.assertOwned
    });
    const env = {
      DATABASE_URL: `postgresql://${resources.pg.roleName}:${resources.pg.password}@${deps.postgresHost ?? "postgres:5432"}/${deps.databaseName ?? "evcp"}?schema=${resources.pg.schemaName}`,
      S3_ENDPOINT: deps.s3Endpoint ?? "http://minio:9000",
      S3_BUCKET: resources.bucket.bucket,
      S3_ACCESS_KEY: resources.bucket.accessKey,
      S3_SECRET_KEY: resources.bucket.secretKey,
      LLM_GATEWAY_KEY: resources.llmKey.key
    };
    const secretPayload = options.codec.seal(env);
    ownedSlot = { ...ownedSlot, secretPayload };
    ownership.assertUpdated(
      await options.store.recordPreparedResources(
        slot.id,
        { llmGatewayKeyId: resources.llmKey.keyId, secretPayload },
        lease()
      )
    );
    const { containerId } = await guard.deps.docker.createContainer(
      buildWarmContainerSpec({
        slotId: slot.id,
        resourceKey: slot.resourceKey,
        image: deps.image ?? "evcp/workspace-next:1",
        env,
        cpuCores: deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1),
        memoryMb: deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048),
        network: deps.network ?? process.env.EVCP_WORKSPACE_NETWORK ?? "evcp-internal",
        workspaceVolume: volumeName
      })
    );
    await ownership.assertOwned();
    await deps.docker.startContainer(containerId);
    await waitForPreviewReady(deps.docker, containerId);
    ownership.assertUpdated(
      await options.store.markReady(
        slot.id,
        { containerId, llmGatewayKeyId: resources.llmKey.keyId, secretPayload },
        lease()
      )
    );
    ready = true;
    await options.auditPreparation("workspace.pool_ready", slot.id, startedAt);
  } catch (error) {
    if (ready || error instanceof WarmSlotOperationLeaseLostError) return;
    const failureCount = slot.failureCount + 1;
    const errorCategory = preparationErrorCategory(error);
    const retryAfter = new Date(now().getTime() + retryDelayMs(failureCount)).toISOString();
    let lastError = errorCategory;
    try {
      cleanupComplete =
        (await cleanupWarmSlotResources(deps, ownedSlot, ownership.assertOwned)) === "cleaned";
      if (!cleanupComplete) lastError = "cleanup_error";
    } catch {
      lastError = "cleanup_error";
    }
    ownership.assertUpdated(
      await options.store.markFailed(slot.id, { lastError, failureCount, retryAfter }, lease())
    );
    await options.auditPreparation(
      "workspace.pool_prepare_failed",
      slot.id,
      startedAt,
      errorCategory
    );
  } finally {
    ownership.stop();
    if (intentCreated && guard.isSettled()) {
      await options.store.preparations.settle(slot.resourceKey);
      if (ready || cleanupComplete) await options.store.preparations.remove(slot.resourceKey);
    }
  }
}
