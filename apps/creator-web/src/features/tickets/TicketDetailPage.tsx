import { DecisionPanel, navigateBrowserPath, SectionCard, ToneBadge } from "@evcp/ui";
import { ArrowLeft, FilePenLine, MessageSquare, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { useCreatorTicketInbox } from "./use-creator-ticket-inbox";

export function TicketDetailPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const projectId = app.selectedProject.id;
  const ticketId = app.creatorRoute.ticketId;
  const inbox = useCreatorTicketInbox(projectId);
  const ticket = inbox.items.find((item) => item.id === ticketId);
  const [actionMessage, setActionMessage] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    setActionMessage("");
    setIsConverting(false);
  }, [ticketId]);

  async function convertToPrdChange() {
    if (!ticket || isConverting || !ticket.actions.includes("convert_to_prd_change")) return;
    setIsConverting(true);
    setActionMessage("Creating PRD change through Platform API.");
    try {
      await createCreatorPlatformClient().convertTicketToPrdChange(projectId, {
        ticketId: ticket.id,
        title: `Address ${ticket.ticketNumber}: ${ticket.title}`,
        proposedRequirement: ticket.description || ticket.title,
        affectedSections: ["functional_requirements"],
        acceptanceCriteria: [
          `Resolve ${ticket.ticketNumber} and preserve existing access behavior.`
        ],
        riskLevel: ticket.priority === "high" ? "high" : "medium"
      });
      setActionMessage("PRD change created through Platform API.");
      try {
        await Promise.all([inbox.refresh(), app.refreshPrdState(projectId)]);
      } catch {
        setActionMessage("PRD change created through Platform API. Refreshing governed state failed.");
      }
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? `PRD change creation failed: ${error.message}`
          : "PRD change creation failed. No local success record was created."
      );
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Ticket detail">
          <SectionCard
            eyebrow="Creator Ticket"
            title={ticket ? `${ticket.ticketNumber} · ${ticket.title}` : "Ticket detail"}
            action={
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  navigateBrowserPath(`/creator/projects/${encodeURIComponent(projectId)}/tickets`)
                }
              >
                <ArrowLeft size={14} /> Back to inbox
              </button>
            }
          >
            <p role="status">{inbox.message}</p>
            {inbox.status === "loading" ? <p>Loading ticket detail from Platform API.</p> : null}
            {inbox.status === "error" ? (
              <DecisionPanel
                tone="danger"
                badge="Platform API unavailable"
                title="Ticket detail is unavailable"
                lines={["No local ticket detail is shown."]}
              />
            ) : null}
            {inbox.status === "ready" && !ticket ? (
              <DecisionPanel
                tone="warning"
                badge="Not found"
                title="Ticket is not in this project inbox"
                lines={["Choose a ticket from the API-backed inbox."]}
              />
            ) : null}
            {ticket ? (
              <div className="creator-ticket-detail">
                <div className="creator-ticket-detail-heading">
                  <MessageSquare size={20} />
                  <div>
                    <strong>{ticket.appName}</strong>
                    <span>
                      {ticket.submittedByEmail} · {ticket.type} · {ticket.deviceInfo}
                    </span>
                  </div>
                  <ToneBadge tone="warning">{ticket.status}</ToneBadge>
                </div>
                <p>{ticket.description || "No ticket description was submitted."}</p>
                <dl>
                  <div>
                    <dt>Priority</dt>
                    <dd>{ticket.priority}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{ticket.createdAt}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </SectionCard>
          <SectionCard eyebrow="Governed action" title="Create an auditable PRD change">
            {actionMessage ? <p role={actionMessage.includes("failed") ? "alert" : "status"}>{actionMessage}</p> : null}
            <button
              type="button"
              onClick={() => void convertToPrdChange()}
              disabled={!ticket || isConverting || !ticket.actions.includes("convert_to_prd_change")}
            >
              <FilePenLine size={16} /> {isConverting ? "Creating PRD Change…" : "Convert to PRD Change"}
            </button>
            <p>Creates a governed PRD change from this ticket, then refreshes the inbox and PRD state.</p>
          </SectionCard>
          <SectionCard eyebrow="Unavailable actions" title="Ticket operations awaiting Platform API support">
            <DecisionPanel
              tone="info"
              badge="Unavailable"
              title="Platform API support required"
              lines={["Reply, Resolve, and Convert to AI Prompt are disabled until Platform API support is available."]}
            />
            <div className="creator-ticket-actions">
              <button
                type="button"
                className="secondary-button"
                disabled
                title="Platform API support required"
              >
                Reply
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled
                title="Platform API support required"
              >
                Resolve
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled
                title="Platform API support required"
              >
                Convert to AI Prompt
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void inbox.refresh()}
                disabled={inbox.status === "loading"}
              >
                <RotateCcw size={14} /> Refresh
              </button>
            </div>
          </SectionCard>
        </section>
      }
    />
  );
}
