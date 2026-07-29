import { useCallback, useEffect, useRef, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export type CreatorTicketInboxItem = {
  id: string;
  ticketNumber: string;
  appName: string;
  title: string;
  submittedByEmail: string;
  type: string;
  priority: string;
  status: string;
  description: string;
  deviceInfo: string;
  screenshotUrl?: string;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{
    id: string;
    status: string;
    label: string;
    actorId?: string;
    occurredAt?: string;
  }>;
  actions: Array<"reply" | "convert_to_prd_change" | "convert_to_ai_prompt" | "resolve">;
};

export function useCreatorTicketInbox(projectId: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<CreatorTicketInboxItem[]>([]);
  const [message, setMessage] = useState("Loading ticket inbox from Platform API.");
  const requestId = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const activeRequest = ++requestId.current;
    if (!projectId) {
      setStatus("error");
      setItems([]);
      setMessage("Select a project to view its ticket inbox.");
      return;
    }
    setStatus("loading");
    setItems([]);
    try {
      const result = await createCreatorPlatformClient().request<CreatorTicketInboxItem[]>(
        `/creator/projects/${encodeURIComponent(projectId)}/tickets`
      );
      if (activeRequest !== requestId.current) return;
      setItems(result);
      setStatus("ready");
      setMessage(
        result.length
          ? "Ticket inbox loaded from Platform API."
          : "No tickets have been submitted for this project."
      );
    } catch {
      if (activeRequest !== requestId.current) return;
      setItems([]);
      setStatus("error");
      setMessage("Ticket inbox is unavailable. No local ticket records are shown.");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, items, message, refresh };
}
