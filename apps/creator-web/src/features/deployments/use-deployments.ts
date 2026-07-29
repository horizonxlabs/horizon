import { useCallback, useEffect, useState } from "react";
import type { WorkspaceDeploymentDto } from "@evcp/api-client";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export function useDeployments(projectId: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Loading deployments from Platform API.");
  const [deployments, setDeployments] = useState<WorkspaceDeploymentDto[]>([]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setMessage("Loading deployments from Platform API.");
    try {
      const nextDeployments = await createCreatorPlatformClient().listDeployments(projectId);
      setDeployments(nextDeployments);
      setStatus("ready");
      setMessage(
        nextDeployments.length
          ? `${nextDeployments.length} deployments loaded from Platform API.`
          : "Platform API returned no deployments for this project."
      );
    } catch (error) {
      setDeployments([]);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `Unable to load deployments: ${error.message}`
          : "Unable to load deployments from Platform API."
      );
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, message, deployments, refresh };
}
