import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDeploymentDto } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

type DeploymentsState = {
  status: "loading" | "ready" | "error";
  message: string;
  deployments: WorkspaceDeploymentDto[];
};

type DeploymentsClient = {
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

export function useDeployments(projectId: string) {
  const [state, setState] = useState<DeploymentsState>(initialDeploymentsState);

  const refresh = useCallback(async () => {
    setState(initialDeploymentsState);
    setState(await loadDeployments(projectId, createCreatorPlatformClient()));
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
