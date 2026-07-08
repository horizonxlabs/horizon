import { DataTable, DecisionPanel, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { creatorTickets, mvpDemoSteps, prdChangeRows, traceRows } from "../../data/mock-data";

export function DefaultTicketsTraceSection() {
  return (
    <>
      <section className="creator-ticket-inbox-shell" aria-label="Creator Ticket Inbox">
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
          <div className="creator-ticket-actions" aria-label="Ticket actions">
            <button type="button">Convert to PRD Change</button>
            <button type="button" className="secondary-button">
              Convert to AI Prompt
            </button>
            <button type="button" className="ghost-button">
              Resolve
            </button>
          </div>
          <DecisionPanel
            tone="info"
            badge="Traceable"
            title="Ticket loop keeps PRD and prompt work connected"
            lines={[
              "Ticket remains visible until resolved",
              "Converted PRD changes can be reviewed before becoming baseline work"
            ]}
          />
        </SectionCard>
      </section>

      <section className="sprint8-shell" aria-label="Ticket-to-PRD Domain Traceability">
        <div className="sprint8-main-panel">
          <SectionCard
            eyebrow="Ticket-to-PRD Change"
            title="Convert ticket into requirement change"
            action={<ToneBadge tone="success">TKT-0001 linked</ToneBadge>}
          >
            <div className="sprint8-conversion-grid">
              <article>
                <span className="eyebrow">Original Ticket</span>
                <strong>TKT-0001 · WFH leave type missing</strong>
                <p>End User reports that WFH is not visible on mobile after publish.</p>
              </article>
              <article>
                <span className="eyebrow">AI Impact</span>
                <strong>Affected sections</strong>
                <p>
                  core_flows and acceptance_criteria need an explicit mobile WFH visibility
                  requirement.
                </p>
              </article>
              <article>
                <span className="eyebrow">Risk</span>
                <strong>medium · internal data</strong>
                <p>No schema change. Approval flow remains unchanged.</p>
              </article>
            </div>
            <div className="creator-ticket-actions">
              <button type="button">Approve PRD Change</button>
              <button type="button" className="secondary-button">
                Reject PRD Change
              </button>
              <button type="button" className="ghost-button">
                Submit for Approval
              </button>
            </div>
          </SectionCard>

          <section className="sprint8-subgrid">
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
              <DecisionPanel
                tone="success"
                badge="Approved"
                title="PRD version 1.1 created from ticket feedback"
                lines={[
                  "Decision history retained",
                  "Ticket remains linked for deployment traceability"
                ]}
              />
            </SectionCard>

            <SectionCard
              eyebrow="Domain Settings"
              title="Internal / Custom / Public"
              className="domain-settings-card"
            >
              <DefinitionGrid
                items={[
                  { label: "Internal Path", value: "/apps/leave-management" },
                  { label: "Custom Domain", value: "not set" },
                  { label: "Public Domain Request", value: "leave.company.example" },
                  { label: "Approval", value: <ToneBadge tone="success">approved</ToneBadge> }
                ]}
              />
              <DecisionPanel
                tone="warning"
                badge="Policy"
                title="Public Domain Request requires approval"
                lines={["Data classification: internal", "External user policy: approved_users"]}
              />
            </SectionCard>
          </section>

          <SectionCard eyebrow="Deployment Traceability" title="Ticket -> PRD -> Deployment">
            <DataTable
              columns={[
                { key: "link", label: "Link" },
                { key: "value", label: "Evidence" }
              ]}
              rows={traceRows}
            />
          </SectionCard>
        </div>

        <aside className="sprint8-side-panel">
          <SectionCard eyebrow="MVP Demo Checklist" title="Pilot readiness">
            <div className="creator-step-list">
              {mvpDemoSteps.map((step) => (
                <div key={step}>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>{step}</strong>
                    <span>ready for demo evidence</span>
                  </div>
                  <ToneBadge tone="success">done</ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </aside>
      </section>
    </>
  );
}
