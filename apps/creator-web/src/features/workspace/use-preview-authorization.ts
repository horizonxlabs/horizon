import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";

// Owns the preview-session authorization lifecycle (extracted from WorkspacePage for the
// size ratchet): re-authorizes per project/preview-refresh/retry and reports whether the
// iframe may render. The keepalive guard keeps the cookie fresh afterwards.
export function usePreviewAuthorization(input: {
  projectId: string;
  previewKey: number;
  runtimeReady: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [previewKey, setPreviewKey] = useState("");

  useEffect(() => {
    let active = true;
    setState("loading");
    setPreviewKey("");
    void createCreatorPlatformClient()
      .authorizeWorkspacePreview(input.projectId)
      .then((authorization) => {
        if (active) {
          setPreviewKey(authorization.previewKey);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [input.projectId, input.previewKey, input.runtimeReady, attempt]);

  return {
    state,
    isAuthorized: state === "ready" && previewKey.length > 0,
    previewKey,
    retry: () => setAttempt((value) => value + 1)
  };
}
