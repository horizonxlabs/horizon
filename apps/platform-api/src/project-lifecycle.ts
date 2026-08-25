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
  acquireChildMutationWithFence?(projectId: string): Promise<{
    fence: ProjectMutationFence;
    release: () => void;
  }>;
  runChildMutation<T>(
    projectId: string,
    operation: (fence: ProjectMutationFence) => Promise<T>
  ): Promise<T>;
  runChildMutationWithLease<T>(
    projectId: string,
    operation: (lease: ProjectMutationLeaseControl) => Promise<T>
  ): Promise<T>;
  runDeletion<T>(
    projectId: string,
    operation: (fence: ProjectDeletionFence) => Promise<T>
  ): Promise<T>;
}

export interface ProjectMutationFence {
  assertCurrent(): Promise<void>;
}

export interface ProjectMutationLeaseControl extends ProjectMutationFence {
  retainFor(milliseconds: number): Promise<void>;
  cancelRetention(): Promise<void>;
}

export interface ProjectDeletionFence {
  readonly epoch: number;
  assertCurrent(): Promise<void>;
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
    if (state.deleting) throw new ProjectDeletionInProgressError(projectId);
    const acquired = await store.acquireMutationLease({
      projectId,
      leaseId,
      durationMs: mutationLeaseMs
    });
    if (!acquired.acquired) {
      throw new ProjectDeletionInProgressError(projectId);
    }
    const epoch = acquired.epoch;
    state.activeMutations += 1;
    let retainedForMs: number | undefined;
    let lost = false;
    const assertCurrent = async () => {
      if (lost || !(await store.assertMutationLease(projectId, leaseId, epoch))) {
        throw new ProjectDeletionInProgressError(projectId);
      }
    };
    const heartbeat = setInterval(() => {
      void store
        .renewMutationLease(leaseId, epoch, Math.max(mutationLeaseMs, retainedForMs ?? 0))
        .then((renewed) => { if (!renewed) lost = true; })
        .catch(() => { lost = true; });
    }, Math.max(1, Math.floor(mutationLeaseMs / 3)));
    heartbeat.unref?.();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      if (!retainedForMs) void store.releaseMutationLease(leaseId, epoch);
      state.activeMutations -= 1;
      if (state.activeMutations === 0) state.resolveDrained?.();
    };
    const control: ProjectMutationLeaseControl = {
      assertCurrent,
      async retainFor(milliseconds) {
        const renewed = await store.renewMutationLease(leaseId, epoch, milliseconds);
        if (!renewed) throw new ProjectDeletionInProgressError(projectId);
        retainedForMs = milliseconds;
      },
      async cancelRetention() {
        retainedForMs = undefined;
      }
    };
    return { control, release };
  };

  const acquireChildMutation = async (projectId: string): Promise<() => void> =>
    (await acquireMutation(projectId)).release;
  const acquireChildMutationWithFence = async (projectId: string) => {
    const { control, release } = await acquireMutation(projectId);
    return { fence: control, release };
  };

  return {
    acquireChildMutation,
    acquireChildMutationWithFence,

    async runChildMutation<T>(
      projectId: string,
      operation: (fence: ProjectMutationFence) => Promise<T>
    ): Promise<T> {
      const { control, release } = await acquireMutation(projectId);
      try {
        await control.assertCurrent();
        const result = await operation(control);
        await control.assertCurrent();
        return result;
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
        await control.assertCurrent();
        const result = await operation(control);
        await control.assertCurrent();
        return result;
      } finally {
        release();
      }
    },

    async runDeletion<T>(
      projectId: string,
      operation: (fence: ProjectDeletionFence) => Promise<T>
    ): Promise<T> {
      const state = stateFor(projectId);
      if (state.deletion) return state.deletion as Promise<T>;
      const deletion = (async () => {
        let epoch: number | undefined;
        let deletionHeartbeat: ReturnType<typeof setInterval> | undefined;
        let lost = false;
        try {
          while (epoch === undefined) {
            const lease = await store.beginDeletion({ projectId, ownerId, durationMs: deletionLeaseMs });
            if (lease.status === "deleted") return { id: projectId, deleted: true } as T;
            if (lease.status === "acquired") epoch = lease.epoch;
            else await sleep(pollIntervalMs);
          }
          const assertCurrent = async () => {
            if (lost || !(await store.assertDeletionLease(projectId, ownerId, epoch!))) {
              throw new ProjectDeletionInProgressError(projectId);
            }
          };
          const renew = async () => {
            const renewed = await store.renewDeletionLease(
              projectId,
              ownerId,
              epoch!,
              deletionLeaseMs
            );
            if (!renewed) {
              lost = true;
              throw new ProjectDeletionInProgressError(projectId);
            }
          };
          deletionHeartbeat = setInterval(() => {
            void renew().catch(() => { lost = true; });
          }, Math.max(1, Math.floor(deletionLeaseMs / 3)));
          deletionHeartbeat.unref?.();
          state.deleting = true;
          if (state.activeMutations > 0 && !state.drained) {
            state.drained = new Promise<void>((resolve) => { state.resolveDrained = resolve; });
          }
          await state.drained;
          while (true) {
            await renew();
            const drainDelay = await store.getMutationDrainDelay(projectId);
            if (drainDelay === null) break;
            await sleep(Math.max(1, Math.min(pollIntervalMs, drainDelay)));
          }
          const fence: ProjectDeletionFence = { epoch, assertCurrent };
          await fence.assertCurrent();
          const result = await operation(fence);
          await fence.assertCurrent();
          if (!(await store.completeDeletion(projectId, ownerId, epoch))) {
            throw new ProjectDeletionInProgressError(projectId);
          }
          return result;
        } catch (error) {
          if (epoch !== undefined) {
            await store.abandonDeletion(projectId, ownerId, epoch).catch(() => undefined);
          }
          throw error;
        } finally {
          if (deletionHeartbeat) clearInterval(deletionHeartbeat);
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
