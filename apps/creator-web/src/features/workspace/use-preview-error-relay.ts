import { useEffect, useRef } from "react";
import { apiBaseUrl } from "@/shared/runtime-config";
import type { BugReport } from "./vibe-bugs";
import { vibeAuthHeaders } from "@/shared/session";

// Listens for error reports posted by the preview iframe (dev-error-relay / error
// boundary in the generated app). Each report is registered with the platform (audit +
// classification) and lands in the Bug Report box — the USER decides when to fix.
export function usePreviewErrorRelay(input: {
  projectId: string;
  enabled: boolean;
  onBug: (bug: BugReport) => void;
}): void {
  const { projectId, enabled, onBug } = input;
  const onBugRef = useRef(onBug);
  onBugRef.current = onBug;

  useEffect(() => {
    if (!enabled || !projectId) return;
    let reporting = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; source?: unknown; message?: unknown } | null;
      if (event.origin !== window.location.origin) return;
      if (!data || data.type !== "evcp:preview-error" || reporting) return;
      reporting = true;
      const base = apiBaseUrl() ?? "/api";
      void fetch(`${base}/projects/${encodeURIComponent(projectId)}/chat/error-report`, {
        method: "POST",
        headers: vibeAuthHeaders(),
        body: JSON.stringify({ source: data.source, message: data.message })
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json().catch(() => null)) as { bug?: BugReport } | null;
          if (body?.bug) onBugRef.current(body.bug);
        })
        .catch(() => undefined)
        .finally(() => {
          reporting = false;
        });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [projectId, enabled]);
}
