import { randomUUID } from "node:crypto";
import type { WorkspaceProvisioningLeaseStore } from "../persistence/workspace-provisioning-lease-repository";
import type {
  WarmSlotOperationLease,
  WarmWorkspaceSlot,
  WorkspaceWarmSlotStore
} from "./warm-pool-types";

export class WarmSlotOperationLeaseLostError extends Error {
  constructor() {
    super("warm slot operation lease is no longer owned");
  }
}

export class WorkspaceCleanupProjectLeaseLostError extends Error {
  constructor() {
    super("workspace cleanup project lease is no longer owned");
  }
}

export function defaultWarmSlotIdentity(): Pick<WarmWorkspaceSlot, "id" | "resourceKey"> {
  const token = randomUUID().replaceAll("-", "");
  return { id: `warm_${token}`, resourceKey: `warm-${token}` };
}

export function warmSlotOperationLease(
  ownerId: string,
  now: () => Date,
  leaseMs: number
): WarmSlotOperationLease {
  const current = now();
  return {
    ownerId,
    now: current.toISOString(),
    expiresAt: new Date(current.getTime() + leaseMs).toISOString()
  };
}

export function maintainWarmSlotOperationLease(input: {
  store: WorkspaceWarmSlotStore;
  slotId: string;
  ownerId: string;
  now: () => Date;
  leaseMs: number;
}) {
  const lease = () => warmSlotOperationLease(input.ownerId, input.now, input.leaseMs);
  let lost = false;
  const assertOwned = async () => {
    if (lost) throw new WarmSlotOperationLeaseLostError();
    if (!(await input.store.renewOperation(input.slotId, lease()))) {
      lost = true;
      throw new WarmSlotOperationLeaseLostError();
    }
  };
  const heartbeat = setInterval(
    () => void assertOwned().catch(() => undefined),
    Math.max(10, Math.floor(input.leaseMs / 3))
  );
  heartbeat.unref?.();
  return {
    assertOwned,
    assertUpdated(updated: boolean) {
      if (!updated) {
        lost = true;
        throw new WarmSlotOperationLeaseLostError();
      }
    },
    stop() {
      clearInterval(heartbeat);
    }
  };
}

export async function withMaintainedWarmSlotOperationLease<T>(
  input: Parameters<typeof maintainWarmSlotOperationLease>[0],
  operation: (ownership: ReturnType<typeof maintainWarmSlotOperationLease>) => Promise<T>
): Promise<T> {
  const ownership = maintainWarmSlotOperationLease(input);
  try {
    return await operation(ownership);
  } finally {
    ownership.stop();
  }
}

export function maintainWorkspaceCleanupProjectLease(input: {
  leases: WorkspaceProvisioningLeaseStore;
  projectId: string;
  token: string;
  leaseMs: number;
}) {
  let lost = false;
  const assertOwned = async () => {
    if (
      lost ||
      !(await input.leases.renew(input.projectId, input.token, input.leaseMs))
    ) {
      lost = true;
      throw new WorkspaceCleanupProjectLeaseLostError();
    }
  };
  const heartbeat = setInterval(
    () => void assertOwned().catch(() => undefined),
    Math.max(10, Math.floor(input.leaseMs / 3))
  );
  heartbeat.unref?.();
  return {
    assertOwned,
    stop() {
      clearInterval(heartbeat);
    }
  };
}
