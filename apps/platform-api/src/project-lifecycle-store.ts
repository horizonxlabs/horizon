export type DeletionLeaseResult = "acquired" | "busy" | "deleted";

export interface ProjectLifecycleStore {
  acquireMutationLease(input: {
    projectId: string;
    leaseId: string;
    expiresAt: Date;
  }): Promise<boolean>;
  renewMutationLease(leaseId: string, expiresAt: Date): Promise<void>;
  releaseMutationLease(leaseId: string): Promise<void>;
  listActiveMutationLeaseExpiries(projectId: string, now: Date): Promise<Date[]>;
  beginDeletion(input: {
    projectId: string;
    ownerId: string;
    leaseExpiresAt: Date;
    now: Date;
  }): Promise<DeletionLeaseResult>;
  renewDeletionLease(projectId: string, ownerId: string, expiresAt: Date): Promise<boolean>;
  completeDeletion(projectId: string, ownerId: string): Promise<void>;
  abandonDeletion(projectId: string, ownerId: string): Promise<void>;
}

type MemoryLifecycleState = {
  status: "active" | "deleting" | "deleted";
  deletionOwnerId?: string;
  deletionLeaseExpiresAt?: Date;
};

export function createMemoryProjectLifecycleStore(): ProjectLifecycleStore {
  const states = new Map<string, MemoryLifecycleState>();
  const mutations = new Map<string, { projectId: string; expiresAt: Date }>();
  const stateFor = (projectId: string) => {
    const existing = states.get(projectId);
    if (existing) return existing;
    const created: MemoryLifecycleState = { status: "active" };
    states.set(projectId, created);
    return created;
  };

  return {
    async acquireMutationLease({ projectId, leaseId, expiresAt }) {
      if (stateFor(projectId).status !== "active") return false;
      mutations.set(leaseId, { projectId, expiresAt });
      return true;
    },
    async renewMutationLease(leaseId, expiresAt) {
      const lease = mutations.get(leaseId);
      if (lease) lease.expiresAt = expiresAt;
    },
    async releaseMutationLease(leaseId) {
      mutations.delete(leaseId);
    },
    async listActiveMutationLeaseExpiries(projectId, now) {
      for (const [leaseId, lease] of mutations) {
        if (lease.expiresAt <= now) mutations.delete(leaseId);
      }
      return [...mutations.values()]
        .filter((lease) => lease.projectId === projectId)
        .map((lease) => lease.expiresAt);
    },
    async beginDeletion({ projectId, ownerId, leaseExpiresAt, now }) {
      const state = stateFor(projectId);
      if (state.status === "deleted") return "deleted";
      if (
        state.status === "deleting" &&
        state.deletionOwnerId &&
        state.deletionOwnerId !== ownerId &&
        state.deletionLeaseExpiresAt &&
        state.deletionLeaseExpiresAt > now
      ) {
        return "busy";
      }
      state.status = "deleting";
      state.deletionOwnerId = ownerId;
      state.deletionLeaseExpiresAt = leaseExpiresAt;
      return "acquired";
    },
    async renewDeletionLease(projectId, ownerId, expiresAt) {
      const state = stateFor(projectId);
      if (state.status !== "deleting" || state.deletionOwnerId !== ownerId) return false;
      state.deletionLeaseExpiresAt = expiresAt;
      return true;
    },
    async completeDeletion(projectId, ownerId) {
      const state = stateFor(projectId);
      if (state.deletionOwnerId !== ownerId) return;
      state.status = "deleted";
      state.deletionOwnerId = undefined;
      state.deletionLeaseExpiresAt = undefined;
    },
    async abandonDeletion(projectId, ownerId) {
      const state = stateFor(projectId);
      if (state.deletionOwnerId !== ownerId) return;
      state.deletionOwnerId = undefined;
      state.deletionLeaseExpiresAt = undefined;
    }
  };
}
