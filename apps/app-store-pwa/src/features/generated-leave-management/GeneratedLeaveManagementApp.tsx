import { ArrowLeft, CalendarCheck2, CheckCircle2, Clock3, Plus, UserCheck } from "lucide-react";
import { useState } from "react";
import { SectionCard, Select, ToneBadge } from "@evcp/ui";

type LeaveRequest = {
  id: string;
  employee: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved";
};

const seededLeaveRequests: LeaveRequest[] = [
  {
    id: "LR-1001",
    employee: "Somchai P.",
    leaveType: "WFH",
    startDate: "2026-07-06",
    endDate: "2026-07-06",
    reason: "Work from home for focused planning",
    status: "pending"
  },
  {
    id: "LR-1002",
    employee: "Nalida K.",
    leaveType: "Annual Leave",
    startDate: "2026-07-08",
    endDate: "2026-07-09",
    reason: "Family trip",
    status: "approved"
  }
];

export function GeneratedLeaveManagementApp() {
  const [requests, setRequests] = useState<LeaveRequest[]>(seededLeaveRequests);
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [startDate, setStartDate] = useState("2026-07-10");
  const [endDate, setEndDate] = useState("2026-07-10");
  const [reason, setReason] = useState("Personal leave request");
  const [lastSubmitted, setLastSubmitted] = useState<LeaveRequest | undefined>(undefined);
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;

  function handleSubmitLeaveRequest() {
    const nextRequest: LeaveRequest = {
      id: `LR-${1000 + requests.length + 1}`,
      employee: "End User",
      leaveType,
      startDate,
      endDate,
      reason,
      status: "pending"
    };
    setRequests((current) => [nextRequest, ...current]);
    setLastSubmitted(nextRequest);
  }

  function approveRequest(requestId: string) {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, status: "approved" } : request
      )
    );
  }

  return (
    <main className="generated-app-shell">
      <header className="generated-app-header">
        <a className="button-link secondary-link" href="/store">
          <ArrowLeft size={15} />
          Horizon Store
        </a>
        <div>
          <span className="eyebrow">Generated App Runtime</span>
          <h1>Leave Management</h1>
          <p>Submit, track and approve employee leave requests with Platform Auth role context.</p>
        </div>
        <ToneBadge tone="success">published</ToneBadge>
      </header>

      <section className="generated-app-kpis" aria-label="Leave summary">
        <div>
          <CalendarCheck2 size={18} />
          <span>Total requests</span>
          <strong>{requests.length}</strong>
        </div>
        <div>
          <Clock3 size={18} />
          <span>Pending approval</span>
          <strong>{pendingCount}</strong>
        </div>
        <div>
          <UserCheck size={18} />
          <span>Approved</span>
          <strong>{approvedCount}</strong>
        </div>
      </section>

      <section className="generated-app-grid">
        <SectionCard eyebrow="Employee Flow" title="New leave request">
          <div className="generated-request-form">
            <label>
              Leave type
              <Select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
                <option>Annual Leave</option>
                <option>Sick Leave</option>
                <option>WFH</option>
                <option>Business Trip</option>
              </Select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={handleSubmitLeaveRequest}
              disabled={!reason.trim() || !startDate || !endDate}
            >
              <Plus size={15} />
              Submit request
            </button>
          </div>
          {lastSubmitted ? (
            <div className="generated-app-evidence" aria-label="Last submitted request">
              <CheckCircle2 size={18} />
              <div>
                <strong>{lastSubmitted.id} submitted</strong>
                <span>
                  {lastSubmitted.leaveType} · {lastSubmitted.startDate} to {lastSubmitted.endDate}
                </span>
              </div>
              <ToneBadge tone="warning">pending</ToneBadge>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Manager Flow" title="Approval queue">
          <div className="generated-request-list">
            {requests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>
                    {request.id} · {request.employee}
                  </strong>
                  <span>
                    {request.leaveType} · {request.startDate} to {request.endDate}
                  </span>
                  <small>{request.reason}</small>
                </div>
                <ToneBadge tone={request.status === "approved" ? "success" : "warning"}>
                  {request.status}
                </ToneBadge>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => approveRequest(request.id)}
                  disabled={request.status === "approved"}
                >
                  Approve
                </button>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>
    </main>
  );
}
