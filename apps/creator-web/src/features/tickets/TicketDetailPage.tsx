import { Button, navigateBrowserPath, SectionCard, ToneBadge } from "@evcp/ui";
import { ArrowLeft, MessageSquare, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import {
  createTicketPrdChangeAction,
  getTicketPrdChangeActionState,
  subscribeTicketPrdChangeAction
} from "./ticket-actions";
import { formatTicketDate, formatTicketLabel } from "./ticket-format";
import { TicketDetailConversionButton } from "./TicketDetailConversionButton";
import { useCreatorTicketInbox, type CreatorTicketInboxClient } from "./use-creator-ticket-inbox";

export function TicketDetailPage({
  app,
  client
}: {
  app: ReturnType<typeof useCreatorApp>;
  client?: CreatorTicketInboxClient;
}) {
  const projectId = app.selectedProject.id;
  const ticketId = app.creatorRoute.ticketId;
  const inbox = useCreatorTicketInbox(projectId, client);
  const ticket = inbox.items.find((item) => item.id === ticketId);
  const subscribeToConversion = useCallback(
    (listener: () => void) => subscribeTicketPrdChangeAction(projectId, ticketId ?? "", listener),
    [projectId, ticketId]
  );
  const getConversionState = useCallback(
    () => getTicketPrdChangeActionState(projectId, ticketId ?? ""),
    [projectId, ticketId]
  );
  const conversionState = useSyncExternalStore(
    subscribeToConversion,
    getConversionState,
    getConversionState
  );
  const conversion = useMemo(
    () =>
      ticket
        ? createTicketPrdChangeAction({
            projectId,
            ticket,
            client: createCreatorPlatformClient(),
            refreshInbox: inbox.refresh,
            refreshPrdState: app.refreshPrdState
          })
        : undefined,
    [app.refreshPrdState, inbox.refresh, projectId, ticket]
  );

  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Ticket detail">
          <SectionCard
            eyebrow="Creator Ticket"
            title={ticket ? `${ticket.ticketNumber} · ${ticket.title}` : "Ticket detail"}
            action={
              <Button
                type="button"
                variant="ghost"
                className="max-md:min-h-11"
                onClick={() =>
                  navigateBrowserPath(`/creator/projects/${encodeURIComponent(projectId)}/tickets`)
                }
              >
                <ArrowLeft size={14} /> Back to inbox
              </Button>
            }
          >
            {inbox.status === "loading" ? (
              <CreatorState kind="loading" title="Loading ticket detail" />
            ) : inbox.status === "error" ? (
              <CreatorState
                kind="unavailable"
                title="Ticket detail is unavailable"
                description="The ticket has not been changed."
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
            ) : !ticket ? (
              <CreatorState
                kind="empty"
                title="Ticket was not found"
                description="Choose a ticket from this project's inbox."
              />
            ) : null}
            {inbox.status === "ready" && ticket ? (
              <div className="creator-ticket-detail">
                <div className="creator-ticket-detail-heading">
                  <MessageSquare size={20} />
                  <div>
                    <strong>{ticket.appName}</strong>
                    <span>
                      {ticket.submittedByEmail} · {formatTicketLabel(ticket.type)} ·{" "}
                      {ticket.deviceInfo}
                    </span>
                  </div>
                  <ToneBadge tone="warning">{formatTicketLabel(ticket.status)}</ToneBadge>
                </div>
                <p>{ticket.description || "No ticket description was submitted."}</p>
                <dl>
                  <div>
                    <dt>Priority</dt>
                    <dd>{formatTicketLabel(ticket.priority)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatTicketDate(ticket.createdAt)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </SectionCard>
          <SectionCard eyebrow="Governed action" title="Create an auditable PRD change">
            {conversionState.outcome ? (
              <CreatorStatusMessage
                tone={
                  conversionState.outcome.kind === "pending"
                    ? "info"
                    : conversionState.outcome.kind === "partial-success"
                      ? "warning"
                      : conversionState.outcome.kind === "failure"
                        ? "danger"
                        : "success"
                }
                technicalDetails={
                  "technicalDetails" in conversionState.outcome
                    ? conversionState.outcome.technicalDetails
                    : undefined
                }
              >
                {conversionState.outcome.message}
              </CreatorStatusMessage>
            ) : null}
            <TicketDetailConversionButton
              conversion={conversion}
              isConverting={conversionState.pending}
              disabled={
                !ticket ||
                conversionState.pending ||
                !ticket.actions.includes("convert_to_prd_change")
              }
              onOutcome={() => undefined}
              onPendingChange={() => undefined}
            />
            <p>
              Creates a governed PRD change from this ticket, then refreshes the inbox and PRD
              state.
            </p>
          </SectionCard>
          <SectionCard
            eyebrow="Unavailable actions"
            title="Ticket operations awaiting Platform API support"
          >
            <CreatorState
              kind="unavailable"
              title="Platform API support required"
              description="Reply, Resolve, and Convert to AI Prompt are not available yet."
            />
            <div className="creator-ticket-actions">
              <Button
                type="button"
                variant="secondary"
                disabled
                title="Platform API support required"
              >
                Reply
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled
                title="Platform API support required"
              >
                Resolve
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled
                title="Platform API support required"
              >
                Convert to AI Prompt
              </Button>
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
          </SectionCard>
        </section>
      }
    />
  );
}
