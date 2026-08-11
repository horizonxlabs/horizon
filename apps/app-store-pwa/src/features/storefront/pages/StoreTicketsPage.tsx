import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreTicketResponse } from "@evcp/api-client";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { StorePageHeader } from "../StorePageHeader";
import { StoreStatePanel } from "../StoreStatePanel";
import { useStorefront } from "../StoreProvider";

type TicketHistoryEntry =
  | { ticketId: string; status: "ready"; ticket: StoreTicketResponse }
  | { ticketId: string; status: "unavailable"; message: string };

type TicketHistoryState =
  | { status: "loading"; entries: TicketHistoryEntry[] }
  | { status: "ready"; entries: TicketHistoryEntry[] };

function ticketError(error: unknown): string {
  return error instanceof Error ? error.message : "Ticket unavailable";
}

export function StoreTicketsPage() {
  const { api, device } = useStorefront();
  const ticketIds = device.ticketIds;
  const ticketKey = ticketIds.join("\u0000");
  const sequence = useRef(0);
  const inflight = useRef<{ key: string; request: Promise<TicketHistoryEntry[]> } | undefined>(
    undefined
  );
  const [history, setHistory] = useState<TicketHistoryState>({ status: "loading", entries: [] });

  const loadTickets = useCallback(async () => {
    const key = ticketKey;
    const requestNumber = ++sequence.current;
    setHistory((current) => ({ status: "loading", entries: current.entries }));
    let request = inflight.current?.key === key ? inflight.current.request : undefined;
    if (!request) {
      request = Promise.all(
        ticketIds.map(async (ticketId): Promise<TicketHistoryEntry> => {
          try {
            return { ticketId, status: "ready", ticket: await api.getStoreTicket(ticketId) };
          } catch (error) {
            return { ticketId, status: "unavailable", message: ticketError(error) };
          }
        })
      );
      inflight.current = { key, request };
      void request.finally(() => {
        if (inflight.current?.request === request) inflight.current = undefined;
      });
    }
    const entries = await request;
    if (requestNumber === sequence.current) setHistory({ status: "ready", entries });
  }, [api, ticketIds, ticketKey]);

  useEffect(() => {
    void loadTickets();
    return () => {
      sequence.current += 1;
    };
  }, [loadTickets]);

  return (
    <section className="store-page store-device-history-page">
      <StorePageHeader
        action={
          ticketIds.length ? (
            <button type="button" className="secondary-button" onClick={() => void loadTickets()}>
              Reload ticket history
            </button>
          ) : undefined
        }
        count={ticketIds.length}
        description="Current ticket status is loaded independently from the Platform API."
        deviceLocal
        eyebrow="Support status"
        title="Ticket History"
      />
      {!ticketIds.length ? (
        <StoreStatePanel eyebrow="This device" title="No ticket history on this device">
          <p>Submit a ticket from an app detail page to remember its ticket ID on this device.</p>
        </StoreStatePanel>
      ) : history.status === "loading" && !history.entries.length ? (
        <StoreStatePanel eyebrow="Platform API" title="Loading ticket history">
          <p>Loading remembered ticket IDs independently.</p>
        </StoreStatePanel>
      ) : (
        <div className="store-history-list" aria-busy={history.status === "loading"}>
          {history.entries.map((entry) =>
            entry.status === "ready" ? (
              <a
                className="store-history-card store-history-link"
                href={`/store/tickets/${encodeURIComponent(entry.ticketId)}`}
                key={entry.ticketId}
                onClick={(event) => {
                  event.preventDefault();
                  navigateBrowserPath(`/store/tickets/${encodeURIComponent(entry.ticketId)}`);
                }}
              >
                <span>
                  <strong>{entry.ticket.ticketNumber}</strong>
                  <small>
                    {entry.ticket.appName ?? entry.ticket.appSlug} ·{" "}
                    {entry.ticket.title ?? "Support ticket"}
                  </small>
                </span>
                <ToneBadge tone={entry.ticket.status === "resolved" ? "success" : "warning"}>
                  {entry.ticket.status}
                </ToneBadge>
              </a>
            ) : (
              <article
                className="store-history-card store-history-unavailable"
                key={entry.ticketId}
              >
                <div>
                  <strong>{entry.ticketId}</strong>
                  <span>{entry.message}</span>
                </div>
                <ToneBadge tone="danger">unavailable</ToneBadge>
              </article>
            )
          )}
        </div>
      )}
    </section>
  );
}
