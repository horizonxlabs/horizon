import type { PlatformRequest } from "./platform-http-types";
import { randomUUID } from "node:crypto";
import {
  createMemoryProjectLifecycleStore,
  type ProjectLifecycleStore
} from "./project-lifecycle-store";

export { createMemoryProjectLifecycleStore } from "./project-lifecycle-store";

export class ProjectDeletionInProgressError extends Error {
  readonly code = "PROJECT_DELETION_IN_PROGRESS";

  constructor(projectId: string) {
    super(`Project '${projectId}' is being deleted and cannot accept new changes`);
    this.name = "ProjectDeletionInProgressError";
  }
}

export interface ProjectLifecycleCoordinator {
  acquireChildMutation(projectId: string): Promise<() => void>;
  runChildMutation<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
  runChildMutationWithLease<T>(
    projectId: string,
    operation: (lease: ProjectMutationLeaseControl) => Promise<T>
  ): Promise<T>;
  runDeletion<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

export interface ProjectMutationLeaseControl {
  retainFor(milliseconds: number): Promise<void>;
  retainUntil(expiresAt: Date): Promise<void>;
  cancelRetention(): Promise<void>;
}

type ProjectLifecycleState = {
  deleting: boolean;
  activeMutations: number;
  drained?: Promise<void>;
  resolveDrained?: () => void;
  deletion?: Promise<unknown>;
};

/**
 * Coordinates child writes and deletion through durable leases. Once deletion is requested, its
 * tombstone survives process restarts: active writes drain, later writes fail closed, concurrent
 * deletes share one outcome, and an expired owner lease permits crash recovery.
 */
export function createProjectLifecycleCoordinator(input: {
  store?: ProjectLifecycleStore;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  mutationLeaseMs?: number;
  deletionLeaseMs?: number;
  pollIntervalMs?: number;
} = {}): ProjectLifecycleCoordinator {
  const store = input.store ?? createMemoryProjectLifecycleStore();
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const mutationLeaseMs = input.mutationLeaseMs ?? 30_000;
  const deletionLeaseMs = input.deletionLeaseMs ?? 30_000;
  const pollIntervalMs = input.pollIntervalMs ?? 25;
  const ownerId = `lifecycle_${randomUUID()}`;
  const states = new Map<string, ProjectLifecycleState>();
  const stateFor = (projectId: string) => {
    const existing = states.get(projectId);
    if (existing) return existing;
    const created: ProjectLifecycleState = { deleting: false, activeMutations: 0 };
    states.set(projectId, created);
    return created;
  };

  const acquireMutation = async (projectId: string) => {
    const state = stateFor(projectId);
    const leaseId = `mutation_${randomUUID()}`;
    const acquired =
      !state.deleting &&
      (await store.acquireMutationLease({
        projectId,
        leaseId,
        expiresAt: new Date(now().getTime() + mutationLeaseMs)
      }));
    if (!acquired) {
      throw new ProjectDeletionInProgressError(projectId);
    }
    state.activeMutations += 1;
    let retainedUntil: Date | undefined;
    const heartbeat = setInterval(() => {
      const defaultExpiry = now().getTime() + mutationLeaseMs;
      const expiresAt = new Date(Math.max(defaultExpiry, retainedUntil?.getTime() ?? 0));
      void store.renewMutationLease(leaseId, expiresAt);
    }, Math.max(1, Math.floor(mutationLeaseMs / 3)));
    heartbeat.unref?.();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      if (!retainedUntil) void store.releaseMutationLease(leaseId);
      state.activeMutations -= 1;
      if (state.activeMutations === 0) state.resolveDrained?.();
    };
    const control: ProjectMutationLeaseControl = {
      async retainFor(milliseconds) {
        await control.retainUntil(new Date(now().getTime() + milliseconds));
      },
      async retainUntil(expiresAt) {
        await store.renewMutationLease(leaseId, expiresAt);
        retainedUntil = expiresAt;
      },
      async cancelRetention() {
        retainedUntil = undefined;
      }
    };
    return { control, release };
  };

  const acquireChildMutation = async (projectId: string): Promise<() => void> =>
    (await acquireMutation(projectId)).release;

  return {
    acquireChildMutation,

    async runChildMutation<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
      const { release } = await acquireMutation(projectId);
      try {
        return await operation();
      } finally {
        release();
      }
    },

    async runChildMutationWithLease<T>(
      projectId: string,
      operation: (lease: ProjectMutationLeaseControl) => Promise<T>
    ) {
      const { control, release } = await acquireMutation(projectId);
      try {
        return await operation(control);
      } finally {
        release();
      }
    },

    async runDeletion<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
      const state = stateFor(projectId);
      if (state.deletion) return state.deletion as Promise<T>;
      const deletion = (async () => {
        while (true) {
          const lease = await store.beginDeletion({
            projectId,
            ownerId,
            leaseExpiresAt: new Date(now().getTime() + deletionLeaseMs),
            now: now()
          });
          if (lease === "deleted") return { id: projectId, deleted: true } as T;
          if (lease === "acquired") break;
          await sleep(pollIntervalMs);
        }
        const renewDeletionLease = async () => {
          const renewed = await store.renewDeletionLease(
            projectId,
            ownerId,
            new Date(now().getTime() + deletionLeaseMs)
          );
          if (!renewed) throw new ProjectDeletionInProgressError(projectId);
        };
        const deletionHeartbeat = setInterval(() => {
          void renewDeletionLease().catch(() => undefined);
        }, Math.max(1, Math.floor(deletionLeaseMs / 3)));
        deletionHeartbeat.unref?.();
        state.deleting = true;
        if (state.activeMutations > 0 && !state.drained) {
          state.drained = new Promise<void>((resolve) => {
            state.resolveDrained = resolve;
          });
        }
        await state.drained;
        while (true) {
          await renewDeletionLease();
          const expiries = await store.listActiveMutationLeaseExpiries(projectId, now());
          if (expiries.length === 0) break;
          const nextExpiry = Math.min(...expiries.map((expiry) => expiry.getTime()));
          await sleep(
            Math.max(
              1,
              Math.min(
                pollIntervalMs,
                Math.floor(deletionLeaseMs / 3),
                nextExpiry - now().getTime()
              )
            )
          );
        }
        try {
          await renewDeletionLease();
          const result = await operation();
          await store.completeDeletion(projectId, ownerId);
          return result;
        } catch (error) {
          await store.abandonDeletion(projectId, ownerId);
          throw error;
        } finally {
          clearInterval(deletionHeartbeat);
        }
      })();
      state.deletion = deletion;
      try {
        return await deletion;
      } finally {
        if (state.deletion === deletion) state.deletion = undefined;
        state.drained = undefined;
        state.resolveDrained = undefined;
      }
    }
  };
}

function childMutationProjectId(request: PlatformRequest): string | undefined {
  if (request.method !== "POST" && request.method !== "DELETE") return undefined;
  if (request.method === "DELETE" && /^\/projects\/[^/]+$/.test(request.path)) return undefined;
  const match = request.path.match(/^\/(?:creator\/)?projects\/([^/]+)(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function runProjectMutationRequest<T>(input: {
  lifecycle: ProjectLifecycleCoordinator;
  request: PlatformRequest;
  operation: () => Promise<T>;
  onError: (error: unknown) => T;
}): Promise<T> {
  const projectId = childMutationProjectId(input.request);
  if (!projectId) return input.operation();
  try {
    return await input.lifecycle.runChildMutation(projectId, input.operation);
  } catch (error) {
    return input.onError(error);
  }
}
