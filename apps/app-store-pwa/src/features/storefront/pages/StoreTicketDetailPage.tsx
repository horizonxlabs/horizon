import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreTicketResponse } from "@evcp/api-client";
import { SectionCard, ToneBadge } from "@evcp/ui";
import { useStorefront } from "../StoreProvider";

type TicketDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not-found" }
  | { status: "ready"; ticket: StoreTicketResponse };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ticket unavailable";
}

function isNotFound(error: unknown): boolean {
  const message = errorMessage(error).toLocaleLowerCase();
  return message.includes("not found") || message.includes("404");
}

export function StoreTicketDetailPage({ ticketId }: { ticketId: string }) {
  const { api } = useStorefront();
  const sequence = useRef(0);
  const [detail, setDetail] = useState<TicketDetailState>({ status: "loading" });

  const loadTicket = useCallback(async () => {
    const request = ++sequence.current;
    setDetail({ status: "loading" });
    try {
      const ticket = await api.getStoreTicket(ticketId);
      if (request === sequence.current) setDetail(ticket ? { status: "ready", ticket } : { status: "not-found" });
    } catch (error) {
      if (request === sequence.current) setDetail(isNotFound(error) ? { status: "not-found" } : { status: "error", message: errorMessage(error) });
    }
  }, [api, ticketId]);

  useEffect(() => {
    void loadTicket();
    return () => { sequence.current += 1; };
  }, [loadTicket]);

  if (detail.status === "loading") return <section className="store-page"><SectionCard eyebrow="Platform API" title="Loading ticket"><p>Loading the current ticket timeline.</p></SectionCard></section>;
  if (detail.status === "not-found") return <section className="store-page"><SectionCard eyebrow="Platform API" title="Ticket not found"><p>This ticket is unavailable to the current session.</p></SectionCard></section>;
  if (detail.status === "error") return <section className="store-page"><SectionCard eyebrow="Platform API" title="Ticket unavailable"><p>{detail.message}</p><button type="button" onClick={() => void loadTicket()}>Retry ticket</button></SectionCard></section>;

  const { ticket } = detail;
  return (
    <section className="store-page store-ticket-detail">
      <div className="store-page-heading">
        <div><span className="eyebrow">Platform API ticket</span><h1>{ticket.ticketNumber}</h1><p>{ticket.appName ?? ticket.appSlug} · {ticket.title ?? "Support ticket"}</p></div>
        <ToneBadge tone={ticket.status === "resolved" ? "success" : "warning"}>{ticket.status}</ToneBadge>
      </div>
      <SectionCard eyebrow="Timeline" title="Current ticket activity">
        {ticket.timeline.length ? <ol className="store-ticket-timeline">{ticket.timeline.map((entry) => <li key={entry.id}><strong>{entry.label}</strong><span>{entry.status}{entry.occurredAt ? ` · ${entry.occurredAt}` : ""}</span></li>)}</ol> : <p>No timeline events are available.</p>}
      </SectionCard>
      <SectionCard eyebrow="Conversation" title="Comments and attachments">
        <p>Platform API support required</p>
        <div className="store-action-row">
          <button type="button" disabled aria-disabled="true">Add comment</button>
          <button type="button" disabled aria-disabled="true">Add attachment</button>
        </div>
      </SectionCard>
      <SectionCard eyebrow="Ticket actions" title="Unsupported ticket changes">
        <p>Platform API support required</p>
        <div className="store-action-row">
          <button type="button" disabled aria-disabled="true">Reply</button>
          <button type="button" disabled aria-disabled="true">Update status</button>
        </div>
      </SectionCard>
    </section>
  );
}
