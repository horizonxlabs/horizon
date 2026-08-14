import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";

// Owns the preview-session authorization lifecycle (extracted from WorkspacePage for the
// size ratchet): re-authorizes per project/preview-refresh/retry and reports whether the
// iframe may render. The keepalive guard keeps the cookie fresh afterwards.
export function usePreviewAuthorization(input: { projectId: string; previewKey: number }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [authorizedKey, setAuthorizedKey] = useState("");
  const requestKey = `${input.projectId}:${input.previewKey}:${attempt}`;

  useEffect(() => {
    let active = true;
    setState("loading");
    setAuthorizedKey("");
    void createCreatorPlatformClient()
      .authorizeWorkspacePreview(input.projectId)
      .then(() => {
        if (active) {
          setAuthorizedKey(requestKey);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
    // requestKey derives from exactly these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.projectId, input.previewKey, attempt]);

  return {
    state,
    isAuthorized: state === "ready" && authorizedKey === requestKey,
    retry: () => setAttempt((value) => value + 1)
  };
}
