import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceDeploymentDto } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

type DeploymentsState = {
  status: "loading" | "ready" | "error";
  message: string;
  deployments: WorkspaceDeploymentDto[];
};

export type DeploymentsClient = {
  listDeployments(projectId: string): Promise<WorkspaceDeploymentDto[]>;
};

export const initialDeploymentsState: DeploymentsState = {
  status: "loading",
  message: "Loading deployments from Platform API.",
  deployments: []
};

export async function loadDeployments(
  projectId: string,
  client: DeploymentsClient
): Promise<DeploymentsState> {
  try {
    const deployments = await client.listDeployments(projectId);
    return {
      status: "ready",
      message: deployments.length
        ? `${deployments.length} deployments loaded from Platform API.`
        : "Platform API returned no deployments for this project.",
      deployments
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? `Unable to load deployments: ${error.message}`
          : "Unable to load deployments from Platform API.",
      deployments: []
    };
  }
}

export function useDeployments(projectId: string, client?: DeploymentsClient) {
  const [scopedState, setScopedState] = useState(() => ({
    projectId,
    state: initialDeploymentsState
  }));
  const mounted = useRef(false);
  const requestGeneration = useRef(0);
  const activeProjectId = useRef(projectId);
  activeProjectId.current = projectId;
  const state = scopedState.projectId === projectId ? scopedState.state : initialDeploymentsState;

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setScopedState({ projectId, state: initialDeploymentsState });
    const nextState = await loadDeployments(projectId, client ?? createCreatorPlatformClient());
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

  return { ...state, refresh };
}
