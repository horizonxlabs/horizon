import { DataTable, SectionCard, ToneBadge } from "@evcp/ui";
import { MessageSquare } from "lucide-react";
import { creatorTickets, prdChangeRows } from "../data/mock-data";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";

export function TicketsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Tickets and PRD changes">
          <SectionCard
            eyebrow="Creator Ticket Inbox"
            title="Feedback routed from App Store"
            action={<ToneBadge tone="warning">1 submitted</ToneBadge>}
          >
            <div className="creator-ticket-list">
              {creatorTickets.map((ticket) => (
                <article key={ticket.ticket}>
                  <div className="creator-ticket-icon">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <strong>
                      {ticket.ticket} · {ticket.summary}
                    </strong>
                    <span>
                      {ticket.app} · {ticket.submitter} · priority {ticket.priority}
                    </span>
                  </div>
                  <ToneBadge tone="warning">{ticket.status}</ToneBadge>
                </article>
              ))}
            </div>
          </SectionCard>
          <SectionCard eyebrow="PRD Change Requests" title="Approval queue">
            <DataTable
              columns={[
                { key: "change", label: "Change" },
                { key: "source", label: "Source" },
                { key: "risk", label: "Risk", tone: () => "warning" },
                { key: "status", label: "Status", tone: () => "success" },
                { key: "requestedBy", label: "Requested By" },
                { key: "updated", label: "Updated" }
              ]}
              rows={prdChangeRows}
            />
          </SectionCard>
        </section>
      }
    />
  );
}
