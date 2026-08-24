import { Button, navigateBrowserPath, SectionCard, ToneBadge } from "@evcp/ui";
import { MessageSquare, RotateCcw } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState } from "@/shared";
import { useCreatorTicketInbox, type CreatorTicketInboxClient } from "./use-creator-ticket-inbox";

export function TicketsPage({
  app,
  client
}: {
  app: ReturnType<typeof useCreatorApp>;
  client?: CreatorTicketInboxClient;
}) {
  const inbox = useCreatorTicketInbox(app.selectedProject.id, client);
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Tickets and PRD changes">
          <SectionCard
            eyebrow="Creator Ticket Inbox"
            title="Feedback routed from App Store"
            action={
              <div className="creator-ticket-actions">
                {inbox.status === "ready" && inbox.items.length ? (
                  <ToneBadge tone="info">{inbox.items.length} tickets</ToneBadge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="max-md:min-h-11"
                  onClick={() => void inbox.refresh().catch(() => undefined)}
                  disabled={inbox.status === "loading"}
                >
                  <RotateCcw size={14} /> Refresh
                </Button>
              </div>
            }
          >
            {inbox.status === "loading" ? (
              <CreatorState kind="loading" title="Loading tickets" />
            ) : inbox.status === "error" ? (
              <CreatorState
                kind="unavailable"
                title="Ticket service is unavailable"
                description="Existing tickets are unchanged."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void inbox.refresh().catch(() => undefined)}
                  >
                    Retry
                  </Button>
                }
                technicalDetails={inbox.technicalDetails}
              />
            ) : inbox.items.length ? (
              <div className="creator-ticket-list">
                {inbox.items.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.id}
                    className="creator-ticket-row"
                    onClick={() =>
                      navigateBrowserPath(
                        `/creator/projects/${encodeURIComponent(app.selectedProject.id)}/tickets/${encodeURIComponent(ticket.id)}`
                      )
                    }
                  >
                    <div className="creator-ticket-icon">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <strong>
                        {ticket.ticketNumber} · {ticket.title}
                      </strong>
                      <span>
                        {ticket.appName} · {ticket.submittedByEmail} · priority {ticket.priority}
                      </span>
                    </div>
                    <ToneBadge tone="warning">{ticket.status}</ToneBadge>
                  </button>
                ))}
              </div>
            ) : (
              <CreatorState
                kind="empty"
                title="No tickets yet"
                description="Tickets submitted from the Store will appear here."
              />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
