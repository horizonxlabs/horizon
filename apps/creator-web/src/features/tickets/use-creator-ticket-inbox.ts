import { useCallback, useEffect, useRef, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { refreshCreatorTicketInbox } from "./ticket-actions";

export type CreatorTicketInboxClient = {
  request<T>(path: string): Promise<T>;
};

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

export function useCreatorTicketInbox(projectId: string, client?: CreatorTicketInboxClient) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<CreatorTicketInboxItem[]>([]);
  const [message, setMessage] = useState("Loading ticket inbox from Platform API.");
  const [technicalDetails, setTechnicalDetails] = useState<string>();
  const requestId = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const activeRequest = ++requestId.current;
    if (!projectId) {
      setStatus("error");
      setItems([]);
      setMessage("Select a project to view its ticket inbox.");
      setTechnicalDetails(undefined);
      return;
    }
    setStatus("loading");
    setItems([]);
    setTechnicalDetails(undefined);
    try {
      const result = await refreshCreatorTicketInbox(
        projectId,
        client ?? createCreatorPlatformClient()
      );
      if (activeRequest !== requestId.current) return;
      setItems(result);
      setStatus("ready");
      setMessage(
        result.length
          ? "Ticket inbox loaded from Platform API."
          : "No tickets have been submitted for this project."
      );
    } catch (error) {
      if (activeRequest !== requestId.current) return;
      setItems([]);
      setStatus("error");
      setMessage("Ticket service is unavailable.");
      setTechnicalDetails(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  return { status, items, message, technicalDetails, refresh };
}
