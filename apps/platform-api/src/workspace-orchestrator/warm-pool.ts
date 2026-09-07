import { randomUUID } from "node:crypto";
import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type {
  WarmWorkspaceAllocation,
  WarmPoolStatus,
  WarmWorkspaceSlot,
  WorkspaceWarmSlotStore
} from "./warm-pool-types";
import type { WarmPoolSecretCodec } from "./warm-pool-secret-codec";
import { WarmWorkspaceClaimRollbackError } from "./warm-pool-types";
import {
  countSlots,
  countStaleWarmImages,
  reconcileWorkspaceWarmPool
} from "./warm-pool-reconciliation";
import { physicalResourceKey } from "./warm-pool-config";
import { cleanupWarmSlotResources } from "./warm-pool-cleanup";
import {
  defaultWarmSlotIdentity,
  maintainWorkspaceCleanupProjectLease,
  warmSlotOperationLease,
  withMaintainedWarmSlotOperationLease
} from "./warm-pool-operation-lease";
import { isWarmSlotRetryable, retryDelayMs } from "./warm-pool-retry";
import { createWarmPoolWorkTracker } from "./warm-pool-work";
import { recoverWarmClaim } from "./warm-pool-claim-recovery";
import type { WarmRecoveryPublisher } from "./warm-pool-startup-recovery";
import { prepareWarmSlot } from "./warm-pool-preparation";
import { reconcileRetiredWarmPreparations } from "./warm-pool-retirement";
import { repairOwnedWarmSecrets, repairProjectWarmSecrets } from "./warm-pool-owned-repair";
import type { ProvisioningSecretAttempt } from "./secret-store";
const OPERATION_LEASE_MS = 5 * 60_000;

export interface WorkspaceWarmPool {
  ensureCapacity(): Promise<void>;
  /** Stop new requests before awaiting scheduled refill and active reconciliation work. */
  waitForIdle(): Promise<void>;
  claim(
    projectId: string,
    assertProjectOwned: () => Promise<void>
  ): Promise<WarmWorkspaceAllocation | null>;
  recoverClaim(projectId: string, env: Record<string, string>): ReturnType<typeof recoverWarmClaim>;
  repairOwnedClaim(projectId: string, ownership: ProvisioningSecretAttempt): Promise<void>;
  /** Retire only after the caller has persisted runtime ownership under its project lease. */
  completeClaim(slotId: string): Promise<void>;
  failClaim(slotId: string, error: unknown, assertProjectOwned: () => Promise<void>): Promise<void>;
  reconcile(publishRecovered?: WarmRecoveryPublisher): Promise<void>;
  getStatus(): Promise<WarmPoolStatus>;
  getActiveSlotIds(): Promise<ReadonlySet<string>>;
  getClaimProjectIds(): Promise<ReadonlySet<string>>;
  isResourceOwned(resourceKey: string): Promise<boolean>;
  deleteProjectClaims(projectId: string, assertOwned: () => Promise<void>): Promise<void>;
}
export type { WarmPoolStatus } from "./warm-pool-types";

export interface WorkspaceWarmPoolOptions {
  targetSize: number;
  store: WorkspaceWarmSlotStore;
  codec: WarmPoolSecretCodec;
  deps: WorkspaceOrchestratorDeps;
  now?: () => Date;
  createSlotIdentity?: () => Pick<WarmWorkspaceSlot, "id" | "resourceKey">;
  createOperationOwner?: () => string;
  operationLeaseMs?: number;
  env?: NodeJS.ProcessEnv;
}

export function createWorkspaceWarmPool(options: WorkspaceWarmPoolOptions): WorkspaceWarmPool {
  const platformVersion = (options.env ?? process.env).EVCP_VERSION;
  const workspaceImage = (options.deps.image ?? "evcp/workspace-next:1").split("@", 1)[0]!;
  const separator = workspaceImage.lastIndexOf(":");
  const workspaceVersion =
    separator > workspaceImage.lastIndexOf("/") ? workspaceImage.slice(separator + 1) : undefined;
  if (platformVersion && workspaceVersion && platformVersion !== workspaceVersion)
    console.warn("[workspace] configured platform and workspace image tags differ");
  const now = options.now ?? (() => new Date());
  const createSlotIdentity = options.createSlotIdentity ?? defaultWarmSlotIdentity;
  const createOperationOwner = options.createOperationOwner ?? randomUUID;
  const operationLeaseMs = options.operationLeaseMs ?? OPERATION_LEASE_MS;
  let inFlightEnsure: Promise<void> | null = null;
  let inFlightReconcile: ReturnType<typeof reconcileWorkspaceWarmPool> | null = null;
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

  const prepareOne = (slot: WarmWorkspaceSlot, ownerId: string) =>
    prepareWarmSlot({ ...options, now, operationLeaseMs, auditPreparation }, slot, ownerId);

  const ensureCapacityOnce = async (): Promise<void> => {
    const observed = await options.store.list();
    const retries: Array<{ slot: WarmWorkspaceSlot; ownerId: string }> = [];
    for (const slot of observed) {
      if (isWarmSlotRetryable(slot, now())) {
        const ownerId = createOperationOwner();
        const projectLeases = slot.claimProjectId
          ? options.deps.runtimeRecords?.provisioningLeases
          : undefined;
        const projectAcquisition =
          projectLeases && slot.claimProjectId
            ? await projectLeases.acquire(slot.claimProjectId, ownerId, operationLeaseMs)
            : undefined;
        if (projectAcquisition === "contended" || projectAcquisition === "deleting_project")
          continue;
        const projectOwnership =
          projectAcquisition === "acquired" && projectLeases
            ? maintainWorkspaceCleanupProjectLease({
                leases: projectLeases,
                projectId: slot.claimProjectId!,
                token: ownerId,
                leaseMs: operationLeaseMs
              })
            : undefined;
        try {
          const owned = await options.store.acquireCleanup(slot.id, slot, operationLease(ownerId));
          if (!owned) continue;
          await withMaintainedWarmSlotOperationLease(
            { store: options.store, slotId: owned.id, ownerId, now, leaseMs: operationLeaseMs },
            async (ownership) => {
              try {
                const runtimeKeys = await durableRuntimeKeys();
                if (runtimeKeys.has(owned.resourceKey)) {
                  await repairOwnedWarmSecrets(options, owned, {
                    token: ownerId,
                    assertOwned: async () => {
                      await projectOwnership?.assertOwned();
                      await ownership.assertOwned();
                    }
                  });
                  await ownership.assertOwned();
                  await options.store.remove(owned.id, ownerId);
                  return;
                }
                await cleanupSlotResources(owned, async () => {
                  await projectOwnership?.assertOwned();
                  await ownership.assertOwned();
                });
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
        } finally {
          projectOwnership?.stop();
          if (projectAcquisition === "acquired") {
            await projectLeases!.release(slot.claimProjectId!, ownerId).catch(() => undefined);
          }
        }
      }
    }

    // The reservation transaction counts every retry lineage against the full target.
    const candidates = Array.from({ length: options.targetSize }, createSlotIdentity);
    const ownerId = createOperationOwner();
    const reserved = await options.store.reservePreparing(
      options.targetSize,
      candidates,
      operationLease(ownerId)
    );
    const prepared = await Promise.allSettled(
      [...retries, ...reserved.map((slot) => ({ slot, ownerId }))].map(
        ({ slot, ownerId: reservationOwner }) => prepareOne(slot, reservationOwner)
      )
    );
    await reconcileRetiredWarmPreparations(options);
    const failure = prepared.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
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
    async deleteProjectClaims(projectId, assertOwned) {
      for (const slot of await options.store.list()) {
        if (slot.claimProjectId !== projectId) continue;
        await assertOwned();
        await pool.failClaim(slot.id, new Error("project deleting"), assertOwned);
      }
      if ((await options.store.list()).some((slot) => slot.claimProjectId === projectId))
        throw new Error("Project warm claim cleanup remains pending");
    },
    async isResourceOwned(resourceKey) {
      if ((await options.store.list()).some((slot) => slot.resourceKey === resourceKey))
        return true;
      if (
        (await options.store.preparations.list()).some(
          (intent) => intent.resourceKey === resourceKey
        )
      )
        return true;
      // Claim completion saves runtime ownership before removing its slot/journal.
      return (await durableRuntimeKeys()).has(resourceKey);
    },
    ensureCapacity,
    recoverClaim: (projectId, env) => recoverWarmClaim(options, projectId, env),
    repairOwnedClaim: (projectId, ownership) =>
      repairProjectWarmSecrets(options, projectId, ownership),
    waitForIdle: work.waitForIdle,
    async getStatus() {
      const slots = await options.store.list();
      return countSlots(slots, options.targetSize, await countStaleWarmImages(slots, options.deps));
    },
    async getActiveSlotIds() {
      return new Set((await options.store.list()).map((slot) => slot.id));
    },
    async getClaimProjectIds() {
      return new Set(
        (await options.store.list()).flatMap((slot) =>
          slot.claimProjectId ? [slot.claimProjectId] : []
        )
      );
    },
    async claim(projectId, assertProjectOwned) {
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
        await pool.failClaim(slot.id, error, assertProjectOwned);
        try {
          options.deps.onAudit?.({
            action: "workspace.pool_claim_failed",
            projectId,
            metadata: { slotId: slot.id }
          });
        } catch {
          // A quarantined claim must still allow cold fallback if audit delivery fails.
        }
        void work.track(Promise.resolve().then(() => pool.ensureCapacity())).catch(() => undefined);
        return null;
      }
    },
    async completeClaim(slotId) {
      try {
        await options.store.remove(slotId);
      } catch (error) {
        // A committed deletion with a lost response must not roll back its new runtime owner.
        let remaining: WarmWorkspaceSlot[];
        try {
          remaining = await options.store.list();
        } catch {
          throw new WarmWorkspaceClaimRollbackError();
        }
        if (remaining.some((slot) => slot.id === slotId)) throw error;
      }
    },
    async failClaim(slotId, _error, assertProjectOwned) {
      const slot = (await options.store.list()).find((candidate) => candidate.id === slotId);
      if (!slot) return;
      const failureCount = slot.failureCount + 1;
      const retryAfter = new Date(now().getTime() + retryDelayMs(failureCount)).toISOString();
      const ownerId = createOperationOwner();
      const owned = await options.store.acquireCleanup(slotId, slot, operationLease(ownerId));
      if (!owned) return;
      await withMaintainedWarmSlotOperationLease(
        { store: options.store, slotId, ownerId, now, leaseMs: operationLeaseMs },
        async (ownership) => {
          try {
            await assertProjectOwned();
            await ownership.assertOwned();
            if ((await durableRuntimeKeys()).has(owned.resourceKey))
              throw new WarmWorkspaceClaimRollbackError();
            await cleanupSlotResources(owned, async () => {
              await assertProjectOwned();
              await ownership.assertOwned();
            });
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
    reconcile(publishRecovered) {
      if (inFlightReconcile) return inFlightReconcile;
      const reconcile = () => reconcileOnce(publishRecovered);
      const operation = inFlightEnsure ? inFlightEnsure.then(reconcile) : reconcile();
      const tracked = operation.finally(() => {
        if (inFlightReconcile === tracked) inFlightReconcile = null;
      });
      inFlightReconcile = tracked;
      return work.track(tracked);
    }
  };
  async function reconcileOnce(publishRecovered?: WarmRecoveryPublisher): Promise<void> {
    await reconcileWorkspaceWarmPool({
      ...options,
      now,
      operationLeaseMs,
      createOperationOwner,
      publishRecovered,
      cleanupSlotResources,
      retryDelayMs
    });
    await reconcileRetiredWarmPreparations(options);
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
