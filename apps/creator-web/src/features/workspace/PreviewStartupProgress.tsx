import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";

const messages = {
  preparing: ["Preparing workspace", "Restoring your project and its saved files."],
  dependencies: ["Preparing dependencies", "Checking cached packages and installing any changes."],
  starting: ["Starting preview server", "Starting the development server for your app."],
  compiling: [
    "Compiling your app",
    "Preparing the first page. Future edits update with Hot Reload."
  ],
  ready: ["Loading app preview", "The app is ready. Loading its page and assets."],
  error: [
    "Preview needs attention",
    "The server is running, but the app could not finish rendering."
  ],
  failed: [
    "Preview needs attention",
    "The app could not finish starting. Check the preview for error details."
  ]
} as const;
export function PreviewStartupProgress({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<keyof typeof messages>("preparing");
  useEffect(() => {
    let active = true;
    let pending = false;
    setPhase("preparing");
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await createCreatorPlatformClient().request<{ phase: string }>(
          `/projects/${encodeURIComponent(projectId)}/workspace/startup`
        );
        if (active && Object.hasOwn(messages, status.phase))
          setPhase(status.phase as keyof typeof messages);
      } catch {
        /* Keep the last known stage during transient network failures. */
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [projectId]);
  return (
    <>
      <strong>{messages[phase][0]}</strong>
      <span>{messages[phase][1]}</span>
    </>
  );
}
