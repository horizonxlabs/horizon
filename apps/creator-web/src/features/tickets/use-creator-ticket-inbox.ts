import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";

export type CreatorTicketInboxItem = {
  id: string;
  ticketNumber: string;
  appName: string;
  title: string;
  submittedByEmail: string;
  priority: string;
  status: string;
};

export function useCreatorTicketInbox(projectId: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<CreatorTicketInboxItem[]>([]);
  const [message, setMessage] = useState("Loading ticket inbox from Platform API.");
  useEffect(() => {
    let active = true;
    if (!projectId) {
      setStatus("error");
      setItems([]);
      setMessage("Select a project to view its ticket inbox.");
      return () => { active = false; };
    }
    setStatus("loading");
    setItems([]);
    void createCreatorPlatformClient().request<CreatorTicketInboxItem[]>(`/creator/projects/${encodeURIComponent(projectId)}/tickets`)
      .then((result) => {
        if (!active) return;
        setItems(result);
        setStatus("ready");
        setMessage(result.length ? "Ticket inbox loaded from Platform API." : "No tickets have been submitted for this project.");
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setStatus("error");
        setMessage("Ticket inbox is unavailable. No local ticket records are shown.");
      });
    return () => { active = false; };
  }, [projectId]);
  return { status, items, message };
}
