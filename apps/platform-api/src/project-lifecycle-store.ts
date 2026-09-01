export type DeletionLeaseResult =
  | { status: "acquired"; epoch: number }
  | { status: "busy" }
  | { status: "deleted" };

export type MutationLeaseResult =
  | { acquired: true; epoch: number }
  | { acquired: false };

export interface ProjectLifecycleStore {
  acquireMutationLease(input: {
    projectId: string;
    leaseId: string;
    durationMs: number;
  }): Promise<MutationLeaseResult>;
  renewMutationLease(leaseId: string, epoch: number, durationMs: number): Promise<boolean>;
  releaseMutationLease(leaseId: string, epoch: number): Promise<void>;
  getMutationDrainDelay(projectId: string): Promise<number | null>;
  assertMutationLease(projectId: string, leaseId: string, epoch: number): Promise<boolean>;
  beginDeletion(input: {
    projectId: string;
    ownerId: string;
    durationMs: number;
  }): Promise<DeletionLeaseResult>;
  renewDeletionLease(projectId: string, ownerId: string, epoch: number, durationMs: number): Promise<boolean>;
  assertDeletionLease(projectId: string, ownerId: string, epoch: number): Promise<boolean>;
  completeDeletion(projectId: string, ownerId: string, epoch: number): Promise<boolean>;
  abandonDeletion(projectId: string, ownerId: string, epoch: number): Promise<void>;
}

type MemoryLifecycleState = {
  status: "active" | "deleting" | "deleted";
  epoch: number;
  deletionOwnerId?: string;
  deletionLeaseExpiresAt?: Date;
};

type MemoryMutationLease = { projectId: string; epoch: number; expiresAt: Date };

export function createMemoryProjectLifecycleStore(input: {
  now?: () => Date;
} = {}): ProjectLifecycleStore {
  const now = input.now ?? (() => new Date());
  const states = new Map<string, MemoryLifecycleState>();
  const mutations = new Map<string, MemoryMutationLease>();
  let mutationEpoch = 0;
  const stateFor = (projectId: string) => {
    const existing = states.get(projectId);
    if (existing) return existing;
    const created: MemoryLifecycleState = { status: "active", epoch: 0 };
    states.set(projectId, created);
    return created;
  };
  const activeMutation = (projectId: string, leaseId: string, epoch: number) => {
    const lease = mutations.get(leaseId);
    return Boolean(
      lease && lease.projectId === projectId && lease.epoch === epoch && lease.expiresAt > now()
    );
  };
  const activeDeletion = (projectId: string, ownerId: string, epoch: number) => {
    const state = stateFor(projectId);
    return Boolean(
      state.status === "deleting" && state.deletionOwnerId === ownerId &&
      state.epoch === epoch && state.deletionLeaseExpiresAt &&
      state.deletionLeaseExpiresAt > now()
    );
  };

  return {
    async acquireMutationLease({ projectId, leaseId, durationMs }) {
      if (stateFor(projectId).status !== "active") return { acquired: false };
      const epoch = ++mutationEpoch;
      mutations.set(leaseId, { projectId, epoch, expiresAt: new Date(now().getTime() + durationMs) });
      return { acquired: true, epoch };
    },
    async renewMutationLease(leaseId, epoch, durationMs) {
      const lease = mutations.get(leaseId);
      if (!lease || lease.epoch !== epoch || lease.expiresAt <= now()) return false;
      lease.expiresAt = new Date(now().getTime() + durationMs);
      return true;
    },
    async releaseMutationLease(leaseId, epoch) {
      if (mutations.get(leaseId)?.epoch === epoch) mutations.delete(leaseId);
    },
    async getMutationDrainDelay(projectId) {
      for (const [leaseId, lease] of mutations) {
        if (lease.expiresAt <= now()) mutations.delete(leaseId);
      }
      const expiries = [...mutations.values()]
        .filter((lease) => lease.projectId === projectId)
        .map((lease) => lease.expiresAt.getTime());
      return expiries.length === 0 ? null : Math.max(1, Math.min(...expiries) - now().getTime());
    },
    async assertMutationLease(projectId, leaseId, epoch) {
      return activeMutation(projectId, leaseId, epoch);
    },
    async beginDeletion({ projectId, ownerId, durationMs }) {
      const state = stateFor(projectId);
      if (state.status === "deleted") return { status: "deleted" };
      const heldByOther =
        state.status === "deleting" &&
        state.deletionOwnerId &&
        state.deletionOwnerId !== ownerId &&
        state.deletionLeaseExpiresAt &&
        state.deletionLeaseExpiresAt > now();
      if (heldByOther) return { status: "busy" };
      state.status = "deleting";
      state.epoch += 1;
      state.deletionOwnerId = ownerId;
      state.deletionLeaseExpiresAt = new Date(now().getTime() + durationMs);
      return { status: "acquired", epoch: state.epoch };
    },
    async renewDeletionLease(projectId, ownerId, epoch, durationMs) {
      const state = stateFor(projectId);
      if (
        state.status !== "deleting" || state.deletionOwnerId !== ownerId ||
        state.epoch !== epoch || !state.deletionLeaseExpiresAt ||
        state.deletionLeaseExpiresAt <= now()
      ) return false;
      state.deletionLeaseExpiresAt = new Date(now().getTime() + durationMs);
      return true;
    },
    async assertDeletionLease(projectId, ownerId, epoch) {
      return activeDeletion(projectId, ownerId, epoch);
    },
    async completeDeletion(projectId, ownerId, epoch) {
      const state = stateFor(projectId);
      if (!activeDeletion(projectId, ownerId, epoch)) return false;
      state.status = "deleted";
      state.deletionOwnerId = undefined;
      state.deletionLeaseExpiresAt = undefined;
      return true;
    },
    async abandonDeletion(projectId, ownerId, epoch) {
      const state = stateFor(projectId);
      if (state.deletionOwnerId !== ownerId || state.epoch !== epoch) return;
      state.deletionOwnerId = undefined;
      state.deletionLeaseExpiresAt = undefined;
    }
  };
}
