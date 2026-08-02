import { useCallback, useEffect, useRef, useState } from "react";
import type { FrontendCheckpointTimelineDto, FrontendRestoreResultDto } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

type FrontendVersionsState = {
  status: "loading" | "ready" | "error";
  message: string;
  timeline?: FrontendCheckpointTimelineDto;
  restoringCheckpointId?: string;
  lastRestore?: FrontendRestoreResultDto;
};

type FrontendVersionsClient = {
  getFrontendCheckpoints(projectId: string): Promise<FrontendCheckpointTimelineDto>;
  restoreFrontendCheckpoint(
    projectId: string,
    checkpointId: string
  ): Promise<FrontendRestoreResultDto>;
};

export const initialFrontendVersionsState: FrontendVersionsState = {
  status: "loading",
  message: "Loading frontend checkpoints from Platform API."
};

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export async function loadFrontendVersions(
  projectId: string,
  client: Pick<FrontendVersionsClient, "getFrontendCheckpoints">
): Promise<FrontendVersionsState> {
  try {
    const timeline = await client.getFrontendCheckpoints(projectId);
    return {
      status: "ready",
      message: `${timeline.checkpoints.length} frontend checkpoints loaded from Platform API.`,
      timeline
    };
  } catch (error) {
    const detail = errorMessage(error);
    return {
      status: "error",
      message: detail
        ? `Unable to load frontend checkpoints: ${detail}`
        : "Unable to load frontend checkpoints from Platform API."
    };
  }
}

function restoredMessage(lastRestore: FrontendRestoreResultDto): string {
  return `Restored frontend from ${lastRestore.restoredFrom.version}. Backend, database, auth, roles, membership, domain, and PRD baseline were unchanged.`;
}

export async function restoreFrontendVersion(
  projectId: string,
  checkpointId: string,
  client: FrontendVersionsClient
): Promise<FrontendVersionsState> {
  let lastRestore: FrontendRestoreResultDto;
  try {
    lastRestore = await client.restoreFrontendCheckpoint(projectId, checkpointId);
  } catch (error) {
    const detail = errorMessage(error);
    return {
      status: "error",
      message: detail ? `Frontend restore failed: ${detail}` : "Frontend restore failed."
    };
  }

  try {
    const timeline = await client.getFrontendCheckpoints(projectId);
    return {
      status: "ready",
      message: restoredMessage(lastRestore),
      timeline,
      lastRestore
    };
  } catch (error) {
    const detail = errorMessage(error);
    return {
      status: "ready",
      message: `${restoredMessage(lastRestore)} Timeline refresh failed${detail ? `: ${detail}` : "."}`,
      lastRestore
    };
  }
}

export function useFrontendVersions(projectId: string, client?: FrontendVersionsClient) {
  const [scopedState, setScopedState] = useState(() => ({
    projectId,
    state: initialFrontendVersionsState
  }));
  const mounted = useRef(false);
  const requestGeneration = useRef(0);
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;
  const state =
    scopedState.projectId === projectId ? scopedState.state : initialFrontendVersionsState;

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setScopedState({ projectId, state: initialFrontendVersionsState });
    const nextState = await loadFrontendVersions(
      projectId,
      client ?? createCreatorPlatformClient()
    );
    if (
      mounted.current &&
      generation === requestGeneration.current &&
      activeProjectId.current === projectId
    ) {
      setScopedState({ projectId, state: nextState });
    }
  }, [client, projectId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function restoreCheckpoint(checkpointId: string) {
    const generation = ++requestGeneration.current;
    setScopedState((current) => ({
      projectId,
      state: {
        ...(current.projectId === projectId ? current.state : initialFrontendVersionsState),
        restoringCheckpointId: checkpointId,
        message: "Restoring the selected frontend checkpoint."
      }
    }));
    const nextState = await restoreFrontendVersion(
      projectId,
      checkpointId,
      client ?? createCreatorPlatformClient()
    );
    if (
      mounted.current &&
      generation === requestGeneration.current &&
      activeProjectId.current === projectId
    ) {
      setScopedState({ projectId, state: nextState });
    }
  }

  return { ...state, refresh, restoreCheckpoint };
}
