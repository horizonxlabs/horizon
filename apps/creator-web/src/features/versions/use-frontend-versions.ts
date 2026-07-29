import { useCallback, useEffect, useState } from "react";
import type { FrontendCheckpointTimelineDto, FrontendRestoreResultDto } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

type FrontendVersionsState = {
  status: "loading" | "ready" | "error";
  message: string;
  timeline?: FrontendCheckpointTimelineDto;
  restoringCheckpointId?: string;
  lastRestore?: FrontendRestoreResultDto;
};

export function useFrontendVersions(projectId: string) {
  const [state, setState] = useState<FrontendVersionsState>({
    status: "loading",
    message: "Loading frontend checkpoints from Platform API."
  });

  const refresh = useCallback(async () => {
    setState((current) => ({
      ...current,
      status: "loading",
      message: "Loading frontend checkpoints from Platform API."
    }));
    try {
      const timeline = await createCreatorPlatformClient().getFrontendCheckpoints(projectId);
      setState((current) => ({
        ...current,
        status: "ready",
        message: `${timeline.checkpoints.length} frontend checkpoints loaded from Platform API.`,
        timeline
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message:
          error instanceof Error
            ? `Unable to load frontend checkpoints: ${error.message}`
            : "Unable to load frontend checkpoints from Platform API.",
        timeline: undefined
      }));
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function restoreCheckpoint(checkpointId: string) {
    setState((current) => ({
      ...current,
      restoringCheckpointId: checkpointId,
      message: "Restoring the selected frontend checkpoint."
    }));
    try {
      const lastRestore = await createCreatorPlatformClient().restoreFrontendCheckpoint(
        projectId,
        checkpointId
      );
      const timeline = await createCreatorPlatformClient().getFrontendCheckpoints(projectId);
      setState({
        status: "ready",
        message: `Restored frontend from ${lastRestore.restoredFrom.version}. Backend, database, auth, roles, membership, domain, and PRD baseline were unchanged.`,
        timeline,
        lastRestore
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message:
          error instanceof Error
            ? `Frontend restore failed: ${error.message}`
            : "Frontend restore failed.",
        restoringCheckpointId: undefined
      }));
    }
  }

  return { ...state, refresh, restoreCheckpoint };
}
