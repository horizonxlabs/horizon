import { useEffect } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { PREVIEW_REAUTHORIZE_INTERVAL_MS, isPreviewUnauthorizedMessage } from "./preview-session";

// Keeps the path-scoped preview cookie alive while the workspace is open: renews it on an
// interval well inside its 15-minute lifetime, and immediately when the framed 401 fallback
// page reports an expired session. Renewal only re-sets the cookie — the iframe's own
// refresh then recovers without a remount.
export function usePreviewSessionKeepalive(input: { projectId: string; enabled: boolean }): void {
  const { projectId, enabled } = input;
  useEffect(() => {
    if (!enabled || !projectId) return;
    let renewing = false;
    const renew = () => {
      if (renewing) return;
      renewing = true;
      void createCreatorPlatformClient()
        .authorizeWorkspacePreview(projectId)
        .catch(() => undefined)
        .finally(() => {
          renewing = false;
        });
    };
    const timer = window.setInterval(renew, PREVIEW_REAUTHORIZE_INTERVAL_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && isPreviewUnauthorizedMessage(event.data)) {
        renew();
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [projectId, enabled]);
}
