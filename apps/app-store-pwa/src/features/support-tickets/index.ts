import type { StoreTicketResponse } from "@evcp/api-client";

export function fallbackTicket(appSlug: string, title: string, description: string, deviceInfo: string): StoreTicketResponse {
  return { id: "local_ticket_0001", ticketNumber: "TKT-LOCAL", appSlug, appName: "Local fallback app", type: "bug", priority: "high", title, description, deviceInfo, status: "submitted", timeline: [{ id: "local_tl_001", status: "submitted", label: "Ticket submitted" }] };
}
