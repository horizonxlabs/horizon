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
import { countSlots, reconcileWorkspaceWarmPool } from "./warm-pool-reconciliation";
import { physicalResourceKey } from "./warm-pool-config";
import { cleanupWarmSlotResources } from "./warm-pool-cleanup";
import {
  defaultWarmSlotIdentity,
  maintainWarmSlotOperationLease,
  WarmSlotOperationLeaseLostError,
  warmSlotOperationLease,
  withMaintainedWarmSlotOperationLease
} from "./warm-pool-operation-lease";
import { isWarmSlotRetryable, preparationErrorCategory, retryDelayMs } from "./warm-pool-retry";
import { createWarmPoolWorkTracker } from "./warm-pool-work";

const OPERATION_LEASE_MS = 5 * 60_000;

export interface WorkspaceWarmPool {
  ensureCapacity(): Promise<void>;
  /** Stop new requests before awaiting scheduled refill and active reconciliation work. */
  waitForIdle(): Promise<void>;
  claim(projectId: string): Promise<WarmWorkspaceAllocation | null>;
  completeClaim(slotId: string): Promise<void>;
  failClaim(slotId: string, error: unknown): Promise<void>;
  reconcile(): Promise<void>;
  getStatus(): Promise<WarmPoolStatus>;
  getActiveSlotIds(): Promise<ReadonlySet<string>>;
}

export interface WarmPoolStatus {
  target: number;
  preparing: number;
  ready: number;
  claiming: number;
  failed: number;
}

export interface WorkspaceWarmPoolOptions {
  targetSize: number;
  store: WorkspaceWarmSlotStore;
  codec: WarmPoolSecretCodec;
  deps: WorkspaceOrchestratorDeps;
  now?: () => Date;
  createSlotIdentity?: () => Pick<WarmWorkspaceSlot, "id" | "resourceKey">;
  createOperationOwner?: () => string;
  operationLeaseMs?: number;
}

export function createWorkspaceWarmPool(options: WorkspaceWarmPoolOptions): WorkspaceWarmPool {
  const now = options.now ?? (() => new Date());
  const createSlotIdentity = options.createSlotIdentity ?? defaultWarmSlotIdentity;
  const createOperationOwner = options.createOperationOwner ?? randomUUID;
  const operationLeaseMs = options.operationLeaseMs ?? OPERATION_LEASE_MS;
  const image = options.deps.image ?? "evcp/workspace-next:1";
  const network = options.deps.network ?? process.env.EVCP_WORKSPACE_NETWORK ?? "evcp-internal";
  const cpuCores = options.deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1);
  const memoryMb = options.deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048);
  const databaseName = options.deps.databaseName ?? "evcp";
  const postgresHost = options.deps.postgresHost ?? "postgres:5432";
  const s3Endpoint = options.deps.s3Endpoint ?? "http://minio:9000";
  let inFlightEnsure: Promise<void> | null = null;
  let inFlightReconcile: Promise<void> | null = null;
  const work = createWarmPoolWorkTracker();

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

  const operationLease = (ownerId: string) =>
    warmSlotOperationLease(ownerId, now, operationLeaseMs);
  const cleanupSlotResources = (slot: WarmWorkspaceSlot, assertOwned?: () => Promise<void>) =>
    cleanupWarmSlotResources(options.deps, slot, assertOwned);

  const prepareOne = async (slot: WarmWorkspaceSlot, ownerId: string): Promise<void> => {
    const startedAt = now().getTime();
    const ownership = maintainWarmSlotOperationLease({
      store: options.store,
      slotId: slot.id,
      ownerId,
      now,
      leaseMs: operationLeaseMs
    });
    let ownedSlot = slot;
    try {
      await auditPreparation("workspace.pool_prepare_started", slot.id, startedAt);
      const volumeName = workspaceVolumeName(slot.resourceKey);
      const resources = await provisionIndependentWorkspaceResources(options.deps, {
        projectId: slot.id,
        resourceKey: slot.resourceKey,
        volumeName,
        volumeLabels: workspaceWarmVolumeLabels(slot.id),
        assertOwnership: ownership.assertOwned
      });
      const env = {
        DATABASE_URL: `postgresql://${resources.pg.roleName}:${resources.pg.password}@${postgresHost}/${databaseName}?schema=${resources.pg.schemaName}`,
        S3_ENDPOINT: s3Endpoint,
        S3_BUCKET: resources.bucket.bucket,
        S3_ACCESS_KEY: resources.bucket.accessKey,
        S3_SECRET_KEY: resources.bucket.secretKey,
        LLM_GATEWAY_KEY: resources.llmKey.key
      };
      const secretPayload = options.codec.seal(env);
      ownedSlot = {
        ...ownedSlot,
        llmGatewayKeyId: resources.llmKey.keyId,
        secretPayload
      };
      ownership.assertUpdated(
        await options.store.recordPreparedResources(
          slot.id,
          { llmGatewayKeyId: resources.llmKey.keyId, secretPayload },
          operationLease(ownerId)
        )
      );
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
      ownedSlot = { ...ownedSlot, containerId };
      ownership.assertUpdated(
        await options.store.recordPreparingContainer(slot.id, containerId, operationLease(ownerId))
      );
      await options.deps.docker.startContainer(containerId);
      await waitForPreviewReady(options.deps.docker, containerId);
      ownership.assertUpdated(
        await options.store.markReady(
          slot.id,
          { containerId, llmGatewayKeyId: resources.llmKey.keyId, secretPayload },
          operationLease(ownerId)
        )
      );
      await auditPreparation("workspace.pool_ready", slot.id, startedAt);
    } catch (error) {
      if (error instanceof WarmSlotOperationLeaseLostError) return;
      const failureCount = slot.failureCount + 1;
      const errorCategory = preparationErrorCategory(error);
      const retryAfter = new Date(now().getTime() + retryDelayMs(failureCount)).toISOString();
      let lastError = errorCategory;
      await cleanupSlotResources(ownedSlot, ownership.assertOwned).catch(() => {
        lastError = "cleanup_error";
      });
      ownership.assertUpdated(
        await options.store.markFailed(
          slot.id,
          { lastError, failureCount, retryAfter },
          operationLease(ownerId)
        )
      );
      await auditPreparation("workspace.pool_prepare_failed", slot.id, startedAt, errorCategory);
    } finally {
      ownership.stop();
    }
  };

  const ensureCapacityOnce = async (): Promise<void> => {
    const observed = await options.store.list();
    const retries: Array<{ slot: WarmWorkspaceSlot; ownerId: string }> = [];
    for (const slot of observed) {
      if (isWarmSlotRetryable(slot, now())) {
        const ownerId = createOperationOwner();
        const owned = await options.store.acquireCleanup(
          slot.id,
          slot.state,
          operationLease(ownerId)
        );
        if (!owned) continue;
        await withMaintainedWarmSlotOperationLease(
          { store: options.store, slotId: owned.id, ownerId, now, leaseMs: operationLeaseMs },
          async (ownership) => {
            try {
              const runtimeKeys = await durableRuntimeKeys();
              if (!runtimeKeys.has(owned.resourceKey)) {
                await cleanupSlotResources(owned, ownership.assertOwned);
              }
              if (options.targetSize === 0) {
                await options.store.remove(owned.id, ownerId);
                return;
              }
              const retried = await options.store.retryPreparing(
                owned.id,
                createSlotIdentity().resourceKey,
                operationLease(ownerId)
              );
              if (retried) retries.push({ slot: retried, ownerId });
            } catch {
              const failureCount = owned.failureCount + 1;
              await options.store.markFailed(
                owned.id,
                {
                  lastError: "cleanup_error",
                  failureCount,
                  retryAfter: new Date(now().getTime() + retryDelayMs(failureCount)).toISOString()
                },
                operationLease(ownerId)
              );
            }
          }
        );
      }
    }

    const slots = await options.store.list();
    const blockedFailures = slots.filter(
      (slot) =>
        slot.state === "failed" &&
        slot.retryAfter !== null &&
        new Date(slot.retryAfter).getTime() > now().getTime()
    ).length;
    const reservableTarget = Math.max(0, options.targetSize - blockedFailures);
    const candidates = Array.from({ length: reservableTarget }, createSlotIdentity);
    const ownerId = createOperationOwner();
    const reserved = await options.store.reservePreparing(
      reservableTarget,
      candidates,
      operationLease(ownerId)
    );
    await Promise.all(
      [
        ...retries,
        ...reserved.map((slot) => ({ slot, ownerId }))
      ].map(({ slot, ownerId: reservationOwner }) => prepareOne(slot, reservationOwner))
    );
  };

  const ensureCapacity = (): Promise<void> => {
    if (inFlightEnsure) return inFlightEnsure;
    const operation = inFlightReconcile
      ? inFlightReconcile.then(ensureCapacityOnce)
      : ensureCapacityOnce();
    const tracked = operation.finally(() => {
      if (inFlightEnsure === tracked) inFlightEnsure = null;
    });
    inFlightEnsure = tracked;
    return work.track(tracked);
  };

  const pool: WorkspaceWarmPool = {
    ensureCapacity,
    waitForIdle: work.waitForIdle,
    async getStatus() {
      return countSlots(await options.store.list(), options.targetSize);
    },
    async getActiveSlotIds() {
      return new Set((await options.store.list()).map((slot) => slot.id));
    },
    async claim(projectId) {
      if (options.targetSize === 0) return null;
      // A crashed claimant is reconciled separately; never give that project a second slot.
      if ((await options.store.list()).some((slot) => slot.claimProjectId === projectId))
        return null;
      let slot: WarmWorkspaceSlot | null;
      try {
        slot = await options.store.claim(projectId);
      } catch (error) {
        if (isProjectClaimConflict(error)) return null;
        throw error;
      }
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
        try {
          options.deps.onAudit?.({
            action: "workspace.pool_claim_failed",
            projectId,
            metadata: { slotId: slot.id }
          });
        } catch {
          // A quarantined claim must still allow cold fallback if audit delivery fails.
        }
        void work.track(Promise.resolve().then(() => pool.ensureCapacity()))
          .catch(() => undefined);
        return null;
      }
    },
    async completeClaim(slotId) {
      await options.store.remove(slotId);
    },
    async failClaim(slotId, _error) {
      const slot = (await options.store.list()).find((candidate) => candidate.id === slotId);
      if (!slot) return;
      const failureCount = slot.failureCount + 1;
      const retryAfter = new Date(now().getTime() + retryDelayMs(failureCount)).toISOString();
      const ownerId = createOperationOwner();
      const owned = await options.store.acquireCleanup(slotId, slot.state, operationLease(ownerId));
      if (!owned) return;
      await withMaintainedWarmSlotOperationLease(
        { store: options.store, slotId, ownerId, now, leaseMs: operationLeaseMs },
        async (ownership) => {
          try {
            await cleanupSlotResources(owned, ownership.assertOwned);
            await options.store.remove(slotId, ownerId);
          } catch {
            await options.store.markFailed(
              slotId,
              { lastError: "cleanup_error", failureCount, retryAfter },
              operationLease(ownerId)
            );
          }
        }
      );
    },
    reconcile() {
      if (inFlightReconcile) return inFlightReconcile;
      const operation = inFlightEnsure ? inFlightEnsure.then(reconcileOnce) : reconcileOnce();
      const tracked = operation.finally(() => {
        if (inFlightReconcile === tracked) inFlightReconcile = null;
      });
      inFlightReconcile = tracked;
      return work.track(tracked);
    }
  };

  async function reconcileOnce(): Promise<void> {
    await reconcileWorkspaceWarmPool({
      ...options,
      now,
      operationLeaseMs,
      createOperationOwner,
      cleanupSlotResources,
      retryDelayMs
    });
  }

  async function durableRuntimeKeys(): Promise<Set<string>> {
    return new Set(
      ((await options.deps.runtimeRecords?.list()) ?? []).map(({ record }) =>
        physicalResourceKey(record)
      )
    );
  }

  return pool;
}

function isProjectClaimConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { code?: string; meta?: { target?: unknown }; constraint?: string };
  return (
    (failure.code === "P2002" &&
      /claim_project_id|claimProjectId/.test(JSON.stringify(failure.meta?.target) ?? "")) ||
    (failure.code === "23505" && failure.constraint === "workspace_warm_slots_claim_project_id_key")
  );
}
