import type { WorkspaceSnapshotResponse } from "@evcp/api-client";

export type CreatorProjectRuntimeRequest = Readonly<{
  projectId: string;
  generation: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
}>;

export function createCreatorProjectRuntimeGuard() {
  let generation = 0;
  let activeController: AbortController | undefined;

  function begin(projectId: string): CreatorProjectRuntimeRequest {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    generation += 1;
    const requestGeneration = generation;
    return {
      projectId,
      generation: requestGeneration,
      signal: controller.signal,
      isCurrent: () =>
        requestGeneration === generation &&
        activeController === controller &&
        !controller.signal.aborted
    };
  }

  function invalidate() {
    activeController?.abort();
    activeController = undefined;
    generation += 1;
  }

  return { begin, invalidate };
}

export async function loadCreatorProjectRuntime({
  request,
  enteringWorkspace,
  refreshPrdState,
  ensureWorkspace,
  loadWorkspaceState,
  refreshPublishState,
  onWorkspaceSnapshot,
  onWorkspaceMessage,
  onWorkspaceUnavailable,
  onSettled
}: {
  request: CreatorProjectRuntimeRequest;
  enteringWorkspace: boolean;
  refreshPrdState: (projectId: string, request: CreatorProjectRuntimeRequest) => Promise<void>;
  ensureWorkspace: (projectId: string, signal: AbortSignal) => Promise<void>;
  loadWorkspaceState: (
    projectId: string,
    signal: AbortSignal
  ) => Promise<WorkspaceSnapshotResponse>;
  refreshPublishState: (projectId: string) => Promise<unknown>;
  onWorkspaceSnapshot: (snapshot: WorkspaceSnapshotResponse) => void;
  onWorkspaceMessage: (message: string) => void;
  onWorkspaceUnavailable: () => void;
  onSettled: () => void;
}): Promise<void> {
  try {
    try {
      await refreshPrdState(request.projectId, request);
    } catch {
      // The PRD hook owns its user-facing error. Workspace can still be available.
    }
    if (!request.isCurrent()) return;

    try {
      if (enteringWorkspace) {
        await ensureWorkspace(request.projectId, request.signal);
      }
      if (!request.isCurrent()) return;
      const snapshot = await loadWorkspaceState(request.projectId, request.signal);
      if (!request.isCurrent()) return;
      onWorkspaceSnapshot(snapshot);
      onWorkspaceMessage("Workspace snapshot loaded from Platform API.");
    } catch {
      if (!request.isCurrent()) return;
      onWorkspaceUnavailable();
    }

    if (request.isCurrent()) {
      await refreshPublishState(request.projectId).catch(() => undefined);
    }
  } finally {
    if (request.isCurrent()) onSettled();
  }
}
