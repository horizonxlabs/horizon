import type { PlatformRequest } from "./platform-http-types";

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
  runDeletion<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

type ProjectLifecycleState = {
  deleting: boolean;
  activeMutations: number;
  drained?: Promise<void>;
  resolveDrained?: () => void;
  deletion?: Promise<unknown>;
};

/**
 * Coordinates every child write with deletion for one Platform API process. Once deletion is
 * requested, the tombstone remains for the lifetime of that project id: active writes drain,
 * later writes fail closed, concurrent deletes share one attempt, and a failed attempt may retry.
 */
export function createProjectLifecycleCoordinator(): ProjectLifecycleCoordinator {
  const states = new Map<string, ProjectLifecycleState>();
  const stateFor = (projectId: string) => {
    const existing = states.get(projectId);
    if (existing) return existing;
    const created: ProjectLifecycleState = { deleting: false, activeMutations: 0 };
    states.set(projectId, created);
    return created;
  };

  const acquireChildMutation = async (projectId: string): Promise<() => void> => {
    const state = stateFor(projectId);
    if (state.deleting) throw new ProjectDeletionInProgressError(projectId);
    state.activeMutations += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      state.activeMutations -= 1;
      if (state.activeMutations === 0) state.resolveDrained?.();
    };
  };

  return {
    acquireChildMutation,

    async runChildMutation<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
      const release = await acquireChildMutation(projectId);
      try {
        return await operation();
      } finally {
        release();
      }
    },

    async runDeletion<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
      const state = stateFor(projectId);
      if (state.deletion) return state.deletion as Promise<T>;
      state.deleting = true;
      if (state.activeMutations > 0 && !state.drained) {
        state.drained = new Promise<void>((resolve) => {
          state.resolveDrained = resolve;
        });
      }
      const deletion = (async () => {
        await state.drained;
        return operation();
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
