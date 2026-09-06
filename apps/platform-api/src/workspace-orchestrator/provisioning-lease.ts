import { randomUUID } from "node:crypto";
import type {
  WorkspaceRuntimeRecordStore,
  WorkspaceRuntimeSnapshot
} from "../persistence/workspace-runtime-repository";
import type { WorkspaceProvisioningLeaseStore } from "../persistence/workspace-provisioning-lease-repository";
import type { ProjectSecretStore, ProvisioningSecretAttempt } from "./secret-store";

const LEASE_TTL_MS = 5 * 60_000;
const localLeaseStores = new WeakMap<object, WorkspaceProvisioningLeaseStore>();

export class WorkspaceProvisioningLeaseLostError extends Error {
  constructor() {
    super("workspace provisioning lease is no longer owned");
  }
}

// Legacy memory adapters retain their list/save/remove contract. Durable stores supply DB leases.
function localLeases(
  scope: object,
  store?: WorkspaceRuntimeRecordStore
): WorkspaceProvisioningLeaseStore {
  const existing = localLeaseStores.get(scope);
  if (existing) return existing;
  const tokens = new Map<string, { token: string; expiresAt: number }>();
  const leases: WorkspaceProvisioningLeaseStore = {
    async acquire(projectId, token, ttlMs) {
      if ((tokens.get(projectId)?.expiresAt ?? 0) > Date.now()) return "contended";
      tokens.set(projectId, { token, expiresAt: Date.now() + ttlMs });
      return "acquired";
    },
    async renew(projectId, token, ttlMs) {
      const lease = tokens.get(projectId);
      if (!lease || lease.token !== token || lease.expiresAt <= Date.now()) return false;
      lease.expiresAt = Date.now() + ttlMs;
      return true;
    },
    async save(snapshot, token, ttlMs) {
      if (!(await leases.renew(snapshot.record.projectId, token, ttlMs))) return false;
      await store?.save(snapshot);
      return true;
    },
    async remove(projectId, token, ttlMs) {
      if (!(await leases.renew(projectId, token, ttlMs))) return false;
      await store?.remove(projectId);
      return true;
    },
    async release(projectId, token) {
      if (tokens.get(projectId)?.token === token) tokens.delete(projectId);
    },
    async isActive(projectId) {
      return (tokens.get(projectId)?.expiresAt ?? 0) > Date.now();
    }
  };
  localLeaseStores.set(scope, leases);
  return leases;
}

export function resolveWorkspaceProvisioningLeases(
  store: WorkspaceRuntimeRecordStore | undefined,
  memoryScope: object
): WorkspaceProvisioningLeaseStore {
  return store?.provisioningLeases ?? localLeases(store ?? memoryScope, store);
}

export function createProvisioningLeaseCoordinator(
  getStore: () => WorkspaceRuntimeRecordStore | undefined,
  memoryScope: object
) {
  const active = new Map<
    string,
    { token: string; leases: WorkspaceProvisioningLeaseStore; lost: boolean }
  >();
  const assertOwned = async (projectId: string): Promise<void> => {
    const owner = active.get(projectId);
    if (!owner || owner.lost || !(await owner.leases.renew(projectId, owner.token, LEASE_TTL_MS))) {
      throw new WorkspaceProvisioningLeaseLostError();
    }
  };
  const secretAttempt = (projectId: string): ProvisioningSecretAttempt => {
    const owner = active.get(projectId);
    if (!owner || owner.lost) throw new WorkspaceProvisioningLeaseLostError();
    return {
      token: owner.token,
      async assertOwned() {
        if (active.get(projectId) !== owner) throw new WorkspaceProvisioningLeaseLostError();
        await assertOwned(projectId);
      }
    };
  };
  return {
    assertOwned,
    secretAttempt,
    async adoptSecrets(projectId: string, secrets: ProjectSecretStore): Promise<void> {
      if (!active.has(projectId)) return;
      await secrets.adoptProvisioning(projectId, secretAttempt(projectId));
    },
    async run<T>(
      projectId: string,
      operation: (snapshot?: WorkspaceRuntimeSnapshot) => Promise<T>
    ): Promise<T> {
      const store = getStore();
      const leases = resolveWorkspaceProvisioningLeases(store, memoryScope);
      const token = randomUUID();
      let acquisition = await leases.acquire(projectId, token, LEASE_TTL_MS);
      while (acquisition === "contended") {
        await new Promise((resolve) => setTimeout(resolve, 50));
        acquisition = await leases.acquire(projectId, token, LEASE_TTL_MS);
      }
      if (acquisition === "missing_project") {
        throw new Error(`workspace project '${projectId}' no longer exists`);
      }
      const owner = { token, leases, lost: false };
      active.set(projectId, owner);
      const heartbeat = setInterval(() => {
        void leases
          .renew(projectId, token, LEASE_TTL_MS)
          .then((renewed) => {
            if (!renewed) owner.lost = true;
          })
          .catch(() => {
            owner.lost = true;
          });
      }, LEASE_TTL_MS / 3);
      heartbeat.unref();
      try {
        const snapshot = (await store?.list())?.find((item) => item.record.projectId === projectId);
        return await operation(snapshot);
      } finally {
        clearInterval(heartbeat);
        active.delete(projectId);
        await leases.release(projectId, token).catch(() => undefined);
      }
    },
    async persist(snapshot: WorkspaceRuntimeSnapshot): Promise<void> {
      const owner = active.get(snapshot.record.projectId);
      if (!owner) {
        await getStore()?.save(snapshot);
        return;
      }
      if (owner.lost || !(await owner.leases.save(snapshot, owner.token, LEASE_TTL_MS))) {
        throw new WorkspaceProvisioningLeaseLostError();
      }
    },
    async remove(projectId: string): Promise<void> {
      const owner = active.get(projectId);
      if (
        !owner ||
        owner.lost ||
        !(await owner.leases.remove(projectId, owner.token, LEASE_TTL_MS))
      ) {
        throw new WorkspaceProvisioningLeaseLostError();
      }
    }
  };
}
