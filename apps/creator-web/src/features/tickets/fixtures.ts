export const creatorTickets = [
  {
    ticket: "TKT-0001",
    type: "bug",
    submitter: "user@company.com",
    app: "Leave Management",
    summary: "WFH leave type missing on mobile",
    priority: "high",
    status: "submitted"
  }
];
export const prdChangeRows = [
  {
    change: "CR-0001",
    source: "TKT-0001",
    risk: "medium",
    status: "approved",
    requestedBy: "Creator User",
    updated: "2026-08-18"
  }
];
export const traceRows = [
  { link: "Ticket", value: "TKT-0001 · WFH leave type missing" },
  { link: "PRD Change", value: "CR-0001 · approved" },
  { link: "PRD Version", value: "1.1" },
  { link: "Frontend", value: "fe-0001" },
  { link: "Manifest", value: "manifest v1" },
  { link: "Deployment", value: "dep_leave_management_001" },
  { link: "Domain", value: "leave.company.example" }
];
export const mvpDemoSteps = [
  "Admin configures AI provider/key and guardrail",
  "Creator creates Leave Management and confirms PRD",
  "Creator prompts WFH leave change and publishes",
  "End User submits ticket",
  "Creator converts ticket to PRD change",
  "Approve PRD Change and review traceability",
  "Request and approve public domain",
  "Review MVP Monitoring and Audit Filters"
];
