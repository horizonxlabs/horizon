import { DecisionPanel, navigateBrowserPath, SectionCard, ToneBadge } from "@evcp/ui";
import { MessageSquare, RotateCcw } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { useCreatorTicketInbox } from "./use-creator-ticket-inbox";

export function TicketsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const inbox = useCreatorTicketInbox(app.selectedProject.id);
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
                <ToneBadge tone={inbox.status === "error" ? "danger" : "warning"}>
                  {inbox.status === "ready" ? `${inbox.items.length} tickets` : inbox.status}
                </ToneBadge>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void inbox.refresh().catch(() => undefined)}
                  disabled={inbox.status === "loading"}
                >
                  <RotateCcw size={14} /> Refresh
                </button>
              </div>
            }
          >
            <p>{inbox.message}</p>
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
          </SectionCard>
          <SectionCard eyebrow="PRD Change Requests" title="Approval queue">
            <DecisionPanel tone="info" badge="API-backed inbox" title="No local PRD change records" lines={["Convert a ticket through the governed API to create an auditable PRD change.", "Until then, this view does not render demo approval rows."]} />
          </SectionCard>
        </section>
      }
    />
  );
}
