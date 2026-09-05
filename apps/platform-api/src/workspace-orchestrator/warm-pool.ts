import { randomUUID } from "node:crypto";
import { buildWarmContainerSpec } from "./docker-engine";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type {
  WarmWorkspaceAllocation,
  WarmWorkspaceSlot,
  WorkspaceWarmSlotStore
} from "./warm-pool-types";
import type { WarmPoolSecretCodec } from "./warm-pool-secret-codec";
import {
  waitForPreviewReady,
  workspaceVolumeName,
  workspaceWarmVolumeLabels
} from "./workspace-lifecycle";
import { provisionIndependentWorkspaceResources } from "./workspace-provisioning";

const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export interface WorkspaceWarmPool {
  ensureCapacity(): Promise<void>;
  claim(projectId: string): Promise<WarmWorkspaceAllocation | null>;
  completeClaim(slotId: string): Promise<void>;
  failClaim(slotId: string, error: unknown): Promise<void>;
  reconcile(): Promise<void>;
}

export interface WorkspaceWarmPoolOptions {
  targetSize: number;
  store: WorkspaceWarmSlotStore;
  codec: WarmPoolSecretCodec;
  deps: WorkspaceOrchestratorDeps;
  now?: () => Date;
  createSlotIdentity?: () => Pick<WarmWorkspaceSlot, "id" | "resourceKey">;
}

export function createWorkspaceWarmPool(options: WorkspaceWarmPoolOptions): WorkspaceWarmPool {
  const now = options.now ?? (() => new Date());
  const createSlotIdentity = options.createSlotIdentity ?? defaultSlotIdentity;
  const image = options.deps.image ?? "evcp/workspace-next:1";
  const network = options.deps.network ?? process.env.EVCP_WORKSPACE_NETWORK ?? "evcp-internal";
  const cpuCores = options.deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1);
  const memoryMb = options.deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048);
  const databaseName = options.deps.databaseName ?? "evcp";
  const postgresHost = options.deps.postgresHost ?? "postgres:5432";
  const s3Endpoint = options.deps.s3Endpoint ?? "http://minio:9000";
  let inFlightEnsure: Promise<void> | null = null;

  const slotCounts = async () => {
    const slots = await options.store.list();
    return {
      targetSize: options.targetSize,
      preparingCount: slots.filter((slot) => slot.state === "preparing").length,
      readyCount: slots.filter((slot) => slot.state === "ready").length,
      failedCount: slots.filter((slot) => slot.state === "failed").length
    };
  };

  const auditPreparation = async (
    action: string,
    slotId: string,
    startedAt: number,
    errorCategory?: string
  ) => {
    options.deps.onAudit?.({
      action,
      projectId: slotId,
      metadata: {
        slotId,
        durationMs: Math.max(0, now().getTime() - startedAt),
        ...(await slotCounts()),
        ...(errorCategory ? { errorCategory } : {})
      }
    });
  };

  const cleanupSlotResources = async (slot: WarmWorkspaceSlot): Promise<void> => {
    if (slot.containerId) {
      await options.deps.docker.removeContainer(slot.containerId).catch(() => undefined);
    }
    const cleanup: Array<Promise<unknown>> = [
      options.deps.postgres.releaseSchema(slot.resourceKey),
      options.deps.objectStorage.releaseBucket(slot.resourceKey),
      options.deps.docker.removeVolume(workspaceVolumeName(slot.resourceKey))
    ];
    if (slot.llmGatewayKeyId) {
      cleanup.push(options.deps.llmGateway.revokeVirtualKey(slot.llmGatewayKeyId));
    }
    await Promise.allSettled(cleanup);
  };

  const prepareOne = async (slot: WarmWorkspaceSlot, previousFailureCount = 0): Promise<void> => {
    const startedAt = now().getTime();
    await auditPreparation("workspace.pool_prepare_started", slot.id, startedAt);
    let rollbacks: Array<() => Promise<void>> = [];
    try {
      const volumeName = workspaceVolumeName(slot.resourceKey);
      const resources = await provisionIndependentWorkspaceResources(options.deps, {
        projectId: slot.id,
        resourceKey: slot.resourceKey,
        volumeName,
        volumeLabels: workspaceWarmVolumeLabels(slot.id)
      });
      rollbacks = resources.rollbacks;
      const env = {
        DATABASE_URL: `postgresql://${resources.pg.roleName}:${resources.pg.password}@${postgresHost}/${databaseName}?schema=${resources.pg.schemaName}`,
        S3_ENDPOINT: s3Endpoint,
        S3_BUCKET: resources.bucket.bucket,
        S3_ACCESS_KEY: resources.bucket.accessKey,
        S3_SECRET_KEY: resources.bucket.secretKey,
        LLM_GATEWAY_KEY: resources.llmKey.key
      };
      const secretPayload = options.codec.seal(env);
      const { containerId } = await options.deps.docker.createContainer(
        buildWarmContainerSpec({
          slotId: slot.id,
          resourceKey: slot.resourceKey,
          image,
          env,
          cpuCores,
          memoryMb,
          network,
          workspaceVolume: volumeName
        })
      );
      rollbacks.push(() => options.deps.docker.removeContainer(containerId));
      await options.deps.docker.startContainer(containerId);
      await waitForPreviewReady(options.deps.docker, containerId);
      await options.store.markReady(slot.id, {
        containerId,
        llmGatewayKeyId: resources.llmKey.keyId,
        secretPayload
      });
      await auditPreparation("workspace.pool_ready", slot.id, startedAt);
    } catch (error) {
      for (const rollback of rollbacks.reverse()) {
        await rollback().catch(() => undefined);
      }
      const failureCount = Math.max(slot.failureCount, previousFailureCount) + 1;
      const errorCategory = preparationErrorCategory(error);
      await options.store.markFailed(slot.id, {
        lastError: errorCategory,
        failureCount,
        retryAfter: new Date(now().getTime() + retryDelayMs(failureCount)).toISOString()
      });
      await auditPreparation("workspace.pool_prepare_failed", slot.id, startedAt, errorCategory);
    }
  };

  const ensureCapacityOnce = async (): Promise<void> => {
    const observed = await options.store.list();
    const expiredFailureCounts: number[] = [];
    for (const slot of observed) {
      if (
        slot.state === "failed" &&
        slot.retryAfter !== null &&
        new Date(slot.retryAfter).getTime() <= now().getTime()
      ) {
        await cleanupSlotResources(slot);
        await options.store.remove(slot.id);
        expiredFailureCounts.push(slot.failureCount);
      }
    }

    const slots = await options.store.list();
    const blockedFailures = slots.filter(
      (slot) =>
        slot.state === "failed" &&
        slot.retryAfter !== null &&
        new Date(slot.retryAfter).getTime() > now().getTime()
    ).length;
    const currentCapacity =
      slots.filter((slot) => slot.state === "preparing" || slot.state === "ready").length +
      blockedFailures;
    const missing = Math.max(0, options.targetSize - currentCapacity);
    const reservations: Array<{ slot: WarmWorkspaceSlot; previousFailureCount: number }> = [];
    for (let index = 0; index < missing; index += 1) {
      reservations.push({
        slot: await options.store.createPreparing(createSlotIdentity()),
        previousFailureCount: expiredFailureCounts[index] ?? 0
      });
    }
    await Promise.all(
      reservations.map(({ slot, previousFailureCount }) => prepareOne(slot, previousFailureCount))
    );
  };

  const ensureCapacity = (): Promise<void> => {
    if (inFlightEnsure) return inFlightEnsure;
    const operation = ensureCapacityOnce();
    const tracked = operation.finally(() => {
      if (inFlightEnsure === tracked) inFlightEnsure = null;
    });
    inFlightEnsure = tracked;
    return tracked;
  };

  const pool: WorkspaceWarmPool = {
    ensureCapacity,
    async claim(projectId) {
      const slot = await options.store.claim(projectId);
      if (!slot) return null;
      try {
        if (!slot.containerId || !slot.llmGatewayKeyId || !slot.secretPayload) {
          throw new Error("incomplete warm workspace allocation");
        }
        return {
          slotId: slot.id,
          resourceKey: slot.resourceKey,
          containerId: slot.containerId,
          llmGatewayKeyId: slot.llmGatewayKeyId,
          env: options.codec.open(slot.secretPayload)
        };
      } catch (error) {
        await pool.failClaim(slot.id, error);
        return null;
      }
    },
    async completeClaim(slotId) {
      await options.store.remove(slotId);
    },
    async failClaim(slotId, _error) {
      const slot = (await options.store.list()).find((candidate) => candidate.id === slotId);
      if (!slot) return;
      await cleanupSlotResources(slot);
      await options.store.remove(slotId);
    },
    async reconcile() {
      await ensureCapacity();
    }
  };
  return pool;
}

export function retryDelayMs(failureCount: number): number {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, failureCount - 1), MAX_RETRY_DELAY_MS);
}

function defaultSlotIdentity(): Pick<WarmWorkspaceSlot, "id" | "resourceKey"> {
  const token = randomUUID().replaceAll("-", "");
  return { id: `warm_${token}`, resourceKey: `warm-${token}` };
}

function preparationErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/preview|readiness|health/.test(message)) return "preview_unhealthy";
  if (/docker|container|volume/.test(message)) return "container_error";
  if (/postgres|schema|database/.test(message)) return "postgres_error";
  if (/bucket|minio|object|storage|s3/.test(message)) return "object_storage_error";
  if (/llm|gateway|key/.test(message)) return "llm_gateway_error";
  if (/secret|credential|envelope/.test(message)) return "credential_error";
  return "preparation_error";
}
