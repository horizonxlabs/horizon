import type { WorkspaceOrchestratorDeps } from "./orchestrator-types";
import type { WarmWorkspaceSlot, WorkspaceWarmSlotStore } from "./warm-pool-types";
import type { WarmPoolSecretCodec } from "./warm-pool-secret-codec";
import {
  maintainWarmSlotOperationLease,
  warmSlotOperationLease
} from "./warm-pool-operation-lease";

/** Each receipt is adopted while its lease is live, or compensated by its OLD identity. */
export function createWarmPreparationGuard(input: {
  deps: WorkspaceOrchestratorDeps;
  slot: WarmWorkspaceSlot;
  store: WorkspaceWarmSlotStore;
  codec: WarmPoolSecretCodec;
  ownerId: string;
  now: () => Date;
  leaseMs: number;
  ownership: ReturnType<typeof maintainWarmSlotOperationLease>;
  recordReceipt: (patch: Partial<WarmWorkspaceSlot>) => void;
}) {
  const { deps, ownership, slot } = input;
  let uncertainCreate = false;
  const lease = () => warmSlotOperationLease(input.ownerId, input.now, input.leaseMs);
  const receive = async <T>(
    create: () => Promise<T>,
    compensate: (receipt: T) => Promise<void>,
    adopt: (receipt: T) => Promise<void> = ownership.assertOwned
  ): Promise<T> => {
    // No dispatch after a delayed DB/lease response has made this generation stale.
    await ownership.assertOwned();
    let receipt: T;
    try {
      receipt = await create();
    } catch (error) {
      // A rejected request may still commit remotely. Keep its predeclared intent for sweeps.
      uncertainCreate = true;
      throw error;
    }
    try {
      await adopt(receipt);
    } catch (error) {
      // Never consult a mutable successor slot for compensating an old response.
      await compensate(receipt).catch(() => undefined);
      throw error;
    }
    return receipt;
  };
  return {
    isSettled: () => !uncertainCreate,
    deps: {
      ...deps,
      postgres: {
        ...deps.postgres,
        provisionSchema: (resourceKey: string) =>
          receive(
            () => deps.postgres.provisionSchema(resourceKey),
            () => deps.postgres.releaseSchema(resourceKey)
          )
      },
      objectStorage: {
        ...deps.objectStorage,
        provisionBucket: (resourceKey: string) =>
          receive(
            () => deps.objectStorage.provisionBucket(resourceKey),
            () => deps.objectStorage.releaseBucket(resourceKey)
          )
      },
      llmGateway: {
        ...deps.llmGateway,
        createVirtualKey: (request: Parameters<typeof deps.llmGateway.createVirtualKey>[0]) =>
          receive(
            () => deps.llmGateway.createVirtualKey(request),
            ({ keyId }) => deps.llmGateway.revokeVirtualKey(keyId),
            async ({ keyId, key }) => {
              const patch = {
                llmGatewayKeyId: keyId,
                secretPayload: input.codec.seal({ LLM_GATEWAY_KEY: key })
              };
              input.recordReceipt(patch);
              ownership.assertUpdated(
                await input.store.recordPreparedResources(slot.id, patch, lease())
              );
            }
          )
      },
      docker: {
        ...deps.docker,
        ensureVolume: (name: string, labels: Record<string, string>) =>
          receive(
            () => deps.docker.ensureVolume(name, labels),
            () => deps.docker.removeVolume(name)
          ),
        createContainer: (spec: Parameters<typeof deps.docker.createContainer>[0]) =>
          receive(
            () => deps.docker.createContainer(spec),
            ({ containerId }) => deps.docker.removeContainer(containerId),
            async ({ containerId }) => {
              input.recordReceipt({ containerId });
              ownership.assertUpdated(
                await input.store.recordPreparingContainer(slot.id, containerId, lease())
              );
            }
          )
      }
    } satisfies WorkspaceOrchestratorDeps
  };
}
