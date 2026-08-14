import { useEffect, useRef } from "react";
import { apiBaseUrl } from "@/shared/runtime-config";
import { vibeAuthHeaders } from "@/shared/session";

// Listens for error reports posted by the preview iframe (dev-error-relay / error
// boundary in the generated app). Each report goes to the platform, which decides —
// one automatic repair per error signature, ever — and hands back the debug prompt;
// sending it through the normal chat path means it queues politely behind other work.
export function usePreviewErrorRelay(input: {
  projectId: string;
  enabled: boolean;
  submitPrompt: (prompt: string) => void;
}): void {
  const { projectId, enabled, submitPrompt } = input;
  const submitRef = useRef(submitPrompt);
  submitRef.current = submitPrompt;

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
          const body = (await res.json().catch(() => null)) as {
            shouldDebug?: boolean;
            debugPrompt?: string;
          } | null;
          if (body?.shouldDebug && body.debugPrompt) submitRef.current(body.debugPrompt);
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
