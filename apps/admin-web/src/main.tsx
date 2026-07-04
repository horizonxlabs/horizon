import { navigation } from "@evcp/config";
import { mockUsers } from "@evcp/mock-data";
import { AppShell, DataTable, DecisionPanel, DefinitionGrid, MetricCard, PageHeader, SectionCard, ServiceStrip, ToneBadge, WorkflowRail } from "@evcp/ui";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Fingerprint,
  Gauge,
  Globe2,
  KeyRound,
  ListFilter,
  LockKeyhole,
  Route,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  TicketCheck
} from "lucide-react";
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

const kpis = [
  { label: "Provider พร้อมใช้งาน", value: "2", detail: "OpenAI + Anthropic fallback", icon: BrainCircuit, tone: "success" },
  { label: "API Key ที่ active", value: "1", detail: "fingerprint only", icon: KeyRound, tone: "success" },
  { label: "Route สำหรับ PRD", value: "Ready", detail: "primary + fallback", icon: Route, tone: "info" },
  { label: "Guardrail blocks", value: "1", detail: "24h ล่าสุด", icon: ShieldCheck, tone: "warning" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const providerRows = [
  {
    provider: "OpenAI Production",
    adapter: "openai",
    endpoint: "api.openai.com/v1",
    models: "gpt-4.1, gpt-4.1-mini",
    status: "active",
    checked: "ล่าสุด"
  },
  {
    provider: "Anthropic Fallback",
    adapter: "anthropic",
    endpoint: "api.anthropic.com",
    models: "claude-3-5-sonnet",
    status: "active",
    checked: "ล่าสุด"
  }
];

const routeRows = [
  {
    scenario: "Requirement Analysis",
    primary: "OpenAI Production / gpt-4.1",
    fallback: "Anthropic Fallback / claude-3-5-sonnet",
    guard: "quota + guardrail"
  },
  {
    scenario: "Frontend Coding",
    primary: "OpenAI Production / gpt-4.1-mini",
    fallback: "Anthropic Fallback / claude-3-5-sonnet",
    guard: "quota + guardrail"
  }
];

const guardrailRows = [
  { rule: "Block payroll export", severity: "high", action: "block", scope: "organization", status: "active" },
  { rule: "Warn confidential data", severity: "warning", action: "warn", scope: "organization", status: "active" }
];

const eventRows = [
  {
    event: "gre_0001",
    decision: "Blocked",
    rule: "Block payroll export",
    actor: "Admin User",
    time: "ล่าสุด"
  }
];

const monitoringKpis = [
  { label: "Service Health", value: "5/5", detail: "API, DB, Queue, Storage, Proxy healthy", icon: ServerCog, tone: "success" },
  { label: "Ticket Counts", value: "1 open", detail: "1 ticket converted to PRD change", icon: TicketCheck, tone: "warning" },
  { label: "Domain Requests", value: "1 approved", detail: "leave.company.example", icon: Globe2, tone: "success" },
  { label: "Audit Filters", value: "ready", detail: "actor, action, project, severity", icon: ListFilter, tone: "info" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const serviceHealthRows = [
  { service: "Platform API", status: "healthy", signal: "p95 42ms", owner: "IT Admin" },
  { service: "PostgreSQL", status: "healthy", signal: "migration current", owner: "System" },
  { service: "Redis + BullMQ", status: "healthy", signal: "0 delayed jobs", owner: "System" },
  { service: "MinIO", status: "healthy", signal: "screenshots retained", owner: "System" },
  { service: "Caddy Proxy", status: "healthy", signal: "domain route active", owner: "IT Admin" }
];

const ticketCountRows = [
  { metric: "Submitted", value: "1", trend: "from App Store feedback" },
  { metric: "Planned", value: "1", trend: "converted to PRD change" },
  { metric: "Resolved", value: "0", trend: "awaiting pilot validation" }
];

const domainRequestRows = [
  {
    request: "DOM-0001",
    domain: "leave.company.example",
    project: "Leave Management",
    status: "approved",
    policy: "internal data + approved users"
  }
];

const auditFilterRows = [
  {
    action: "prd.change.approved",
    actor: "creator@company.com",
    severity: "high"
  },
  {
    action: "domain.request.approved",
    actor: "admin@company.com",
    severity: "high"
  },
  {
    action: "ticket.converted_to_prd_change",
    actor: "creator@company.com",
    severity: "high"
  }
];

const authProviderRows = [
  { provider: "Keycloak Default", type: "keycloak", status: "active", mapping: "evcp-admins -> admin" },
  { provider: "Azure AD Production", type: "oidc", status: "ready", mapping: "hr-creators -> creator" },
  { provider: "Okta Workforce", type: "saml", status: "ready", mapping: "IT Admins -> admin" }
];

const authMappingRows = [
  { source: "evcp-admins", platform: "admin", project: "Project Owner", app: "HR Admin" },
  { source: "hr-creators", platform: "creator", project: "Editor", app: "Manager" },
  { source: "evcp-users", platform: "end_user", project: "Viewer", app: "Employee" }
];

const policyRows = [
  { classification: "Public", reviewers: "none", checks: "auth session", exposure: "allowed" },
  { classification: "Internal", reviewers: "Project Owner", checks: "auth + app role", exposure: "approved users" },
  { classification: "Confidential", reviewers: "Security Admin", checks: "audit high severity", exposure: "blocked" },
  { classification: "Restricted", reviewers: "Security + Platform Admin", checks: "break-glass disabled", exposure: "blocked" }
];

function AdminApp() {
  return (
    <AppShell title="EVCP Admin" navItems={navigation.admin} userName={mockUsers.admin.name}>
      <PageHeader
        eyebrow="AI Governance"
        title="ศูนย์ควบคุม AI Providers & API Keys"
        description="ควบคุม provider, secret, routing, quota และ guardrail ของทุก AI call ก่อนใช้งานจริงในองค์กร"
        actions={
          <>
          <button type="button" className="secondary-button">
            <SlidersHorizontal size={16} />
            ตั้งค่า Route
          </button>
          <button type="button">
            <KeyRound size={16} />
            เพิ่ม Provider
          </button>
          </>
        }
      />

      <section className="ds-metric-grid">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              detail={item.detail}
              icon={<Icon size={18} />}
              tone={item.tone}
            />
          );
        })}
      </section>

      <section className="auth-policy-shell" aria-label="Auth SSO and Policy Hardening">
        <div className="admin-monitoring-header">
          <div>
            <span className="eyebrow">Auth / SSO Production Readiness</span>
            <h2>Platform Auth boundary and policy hardening</h2>
            <p>Configure OIDC, SAML and bundled Keycloak while keeping generated apps behind Platform Auth sessions and app-role claims.</p>
          </div>
          <ToneBadge tone="warning">production extension</ToneBadge>
        </div>

        <section className="auth-kpi-grid">
          {[
            ["OIDC", "ready", "Azure AD config masked"],
            ["SAML", "ready", "Okta certificate fingerprint"],
            ["Keycloak Default", "active", "broker realm evcp"],
            ["Direct IdP Constraints", "review", "Platform Auth boundary only"]
          ].map(([label, value, detail]) => (
            <div key={label}>
              <ShieldCheck size={18} />
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>

        <section className="auth-policy-grid">
          <SectionCard eyebrow="SSO Providers" title="Provider registry">
            <div className="auth-desktop-table">
              <DataTable
                columns={[
                  { key: "provider", label: "Provider" },
                  { key: "type", label: "Type" },
                  { key: "status", label: "Status", tone: (value) => (value === "active" ? "success" : "info") },
                  { key: "mapping", label: "Mapping" }
                ]}
                rows={authProviderRows}
              />
            </div>
            <div className="auth-mobile-list">
              {authProviderRows.map((row) => (
                <article key={row.provider}>
                  <strong>{row.provider}</strong>
                  <span>{row.type}</span>
                  <ToneBadge tone={row.status === "active" ? "success" : "info"}>{row.status}</ToneBadge>
                  <small>{row.mapping}</small>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Auth Session Evidence" title="Normalized Platform Auth claims">
            <DefinitionGrid
              items={[
                { label: "Session", value: "psess_sprint9_oidc_001" },
                { label: "Provider", value: "Azure AD Production" },
                { label: "Platform Role", value: <ToneBadge tone="info">creator</ToneBadge> },
                { label: "App Role", value: "Leave Management / Employee" },
                { label: "Token", value: <><Fingerprint size={14} /> session hash only</> },
                { label: "Generated App", value: "validates Platform Auth session" }
              ]}
            />
            <DecisionPanel
              tone="success"
              badge="Boundary"
              title="Generated apps never talk directly to enterprise IdP"
              lines={["Platform Auth owns session, claims and app-role context", "Invalid or missing session is denied server-side"]}
            />
          </SectionCard>

          <SectionCard eyebrow="Role / Group Mapping" title="Groups to platform, project and app roles">
            <div className="auth-desktop-table">
              <DataTable
                columns={[
                  { key: "source", label: "Source Group" },
                  { key: "platform", label: "Platform" },
                  { key: "project", label: "Project" },
                  { key: "app", label: "App" }
                ]}
                rows={authMappingRows}
              />
            </div>
            <div className="auth-mobile-list">
              {authMappingRows.map((row) => (
                <article key={row.source}>
                  <strong>{row.source}</strong>
                  <span>Platform: {row.platform}</span>
                  <span>Project: {row.project}</span>
                  <small>App: {row.app}</small>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Break-glass Admin" title="Local fallback with critical audit">
            <DefinitionGrid
              items={[
                { label: "Reason", value: "required" },
                { label: "TTL", value: "15 minutes" },
                { label: "Audit", value: <ToneBadge tone="danger">auth.break_glass_used</ToneBadge> },
                { label: "Scope", value: "Platform Admin only" }
              ]}
            />
            <DecisionPanel
              tone="danger"
              badge="Critical"
              title="Fallback session is short-lived and reviewable"
              lines={["No SSO dependency during outage", "Reason and ticket reference are retained for audit"]}
            />
          </SectionCard>

          <SectionCard eyebrow="Policy Templates" title="Classification controls">
            <div className="auth-desktop-table">
              <DataTable
                columns={[
                  { key: "classification", label: "Classification" },
                  { key: "reviewers", label: "Reviewers" },
                  { key: "checks", label: "Required Checks" },
                  { key: "exposure", label: "External Exposure", tone: (value) => (value === "blocked" ? "danger" : "info") }
                ]}
                rows={policyRows}
              />
            </div>
            <div className="auth-mobile-list auth-policy-mobile-list">
              {policyRows.map((row) => (
                <article key={row.classification}>
                  <strong>{row.classification}</strong>
                  <span>Reviewers: {row.reviewers}</span>
                  <span>Checks: {row.checks}</span>
                  <ToneBadge tone={row.exposure === "blocked" ? "danger" : "info"}>{row.exposure}</ToneBadge>
                </article>
              ))}
            </div>
          </SectionCard>
        </section>
      </section>

      <section className="ds-workbench">
        <WorkflowRail
          eyebrow="Current Path"
          title="PRD Generation"
          steps={[
            { label: "quota pre-check", icon: <CheckCircle2 size={16} /> },
            { label: "guardrail evaluate", icon: <CheckCircle2 size={16} /> },
            { label: "route primary/fallback", icon: <CheckCircle2 size={16} /> },
            { label: "audit event", icon: <CheckCircle2 size={16} /> }
          ]}
          alert={{
            icon: <AlertTriangle size={18} />,
            title: "Secret exposure: 0",
            description: "API ส่งกลับเฉพาะ fingerprint และ masked value",
            tone: "warning"
          }}
        />

        <div className="ds-main-stack">
          <SectionCard eyebrow="Provider Registry" title="External AI Providers" action={<button type="button" className="ghost-button">Add API Key</button>}>
            <DataTable
              columns={[
                { key: "provider", label: "Provider" },
                { key: "adapter", label: "Adapter" },
                { key: "endpoint", label: "Endpoint" },
                { key: "models", label: "Models" },
                { key: "status", label: "Status", tone: () => "success" },
                { key: "checked", label: "Checked" }
              ]}
              rows={providerRows}
            />
          </SectionCard>

          <section className="ds-grid-2">
            <SectionCard eyebrow="Secret Control" title="API Key Management">
              <div className="ds-summary-row">
                <div className="ds-summary-icon"><LockKeyhole size={22} /></div>
                <div>
                  <strong>Primary Production Key</strong>
                  <span>Secret saved. Only fingerprint is visible.</span>
                </div>
                <ToneBadge tone="success">active</ToneBadge>
              </div>
              <DefinitionGrid
                items={[
                  { label: "Provider", value: "OpenAI Production" },
                  { label: "Usage", value: "production" },
                  { label: "Quota", value: "100k tokens/day" },
                  { label: "Fingerprint", value: <><Fingerprint size={14} /> fp_9f2a4c01d881</> }
                ]}
              />
            </SectionCard>

            <SectionCard eyebrow="Prompt Test" title="Guardrail Decision">
              <label>
                Prompt
                <input defaultValue="Generate payroll export report" />
              </label>
              <DecisionPanel
                tone="danger"
                badge="Blocked"
                title="Decision: block"
                lines={["Matched rule: Block payroll export", "Event id: gre_0001"]}
              />
            </SectionCard>
          </section>

          <section className="ds-grid-2">
            <SectionCard eyebrow="Routing Matrix" title="Scenario Routing" action={<button type="button" className="ghost-button">Configure Routing</button>}>
              <DataTable
                columns={[
                  { key: "scenario", label: "Scenario" },
                  { key: "primary", label: "Primary" },
                  { key: "fallback", label: "Fallback" },
                  { key: "guard", label: "Guard" }
                ]}
                rows={routeRows}
              />
            </SectionCard>

            <SectionCard eyebrow="Quota" title="Token Quota / Token Budget">
              <div className="ds-quota-meter">
                <div><span>Used today</span><strong>999 / 1,000</strong></div>
                <div className="ds-meter-track"><span style={{ width: "99%" }} /></div>
                <small>Hard stop blocks before provider call.</small>
              </div>
              <div className="ds-stack-list">
                {["Organization 1,000 daily", "Creator 500 daily", "Project 300 daily", "App 100 daily"].map((item) => (
                  <p key={item}><Activity size={14} /> {item}</p>
                ))}
              </div>
            </SectionCard>
          </section>

          <section className="ds-grid-2">
            <SectionCard eyebrow="Security Rules" title="Guardrail Rules" action={<button type="button" className="ghost-button">Add Rule</button>}>
              <DataTable
                columns={[
                  { key: "rule", label: "Rule" },
                  { key: "severity", label: "Severity", tone: (value) => (value === "high" ? "danger" : "warning") },
                  { key: "action", label: "Action", tone: (value) => (value === "block" ? "danger" : "warning") },
                  { key: "scope", label: "Scope" },
                  { key: "status", label: "Status", tone: () => "success" }
                ]}
                rows={guardrailRows}
              />
            </SectionCard>

            <SectionCard eyebrow="Event Log" title="Guardrail Events">
              <DataTable
                columns={[
                  { key: "event", label: "Event" },
                  { key: "decision", label: "Decision", tone: () => "danger" },
                  { key: "rule", label: "Matched Rule" },
                  { key: "actor", label: "Actor" },
                  { key: "time", label: "Time" }
                ]}
                rows={eventRows}
              />
            </SectionCard>
          </section>

          <section className="admin-monitoring-shell" aria-label="MVP Monitoring">
            <div className="admin-monitoring-header">
              <div>
                <span className="eyebrow">MVP Monitoring</span>
                <h2>Production Pilot Control Room</h2>
                <p>Operational view for ticket feedback, domain approvals, service health, and audit evidence before the MVP demo.</p>
              </div>
              <ToneBadge tone="success">demo ready</ToneBadge>
            </div>

            <section className="admin-monitoring-kpis">
              {monitoringKpis.map((item) => {
                const Icon = item.icon;
                return (
                  <MetricCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    detail={item.detail}
                    icon={<Icon size={18} />}
                    tone={item.tone}
                  />
                );
              })}
            </section>

            <section className="admin-monitoring-grid">
              <SectionCard eyebrow="Service Health" title="Runtime services">
                <DataTable
                  columns={[
                    { key: "service", label: "Service" },
                    { key: "status", label: "Status", tone: () => "success" },
                    { key: "signal", label: "Signal" },
                    { key: "owner", label: "Owner" }
                  ]}
                  rows={serviceHealthRows}
                />
              </SectionCard>

              <SectionCard eyebrow="Ticket Counts" title="Feedback lifecycle">
                <DataTable
                  columns={[
                    { key: "metric", label: "Metric" },
                    { key: "value", label: "Count", tone: (value) => (value === "0" ? "neutral" : "warning") },
                    { key: "trend", label: "Evidence" }
                  ]}
                  rows={ticketCountRows}
                />
                <DecisionPanel
                  tone="success"
                  badge="Traceable"
                  title="Ticket feedback can become approved PRD scope"
                  lines={["Converted ticket keeps source link", "PRD change approval writes high-severity audit event"]}
                />
              </SectionCard>

              <SectionCard eyebrow="Domain Requests" title="Public domain approvals">
                <DataTable
                  columns={[
                    { key: "request", label: "Request" },
                    { key: "domain", label: "Domain" },
                    { key: "status", label: "Status", tone: () => "success" },
                    { key: "policy", label: "Policy" }
                  ]}
                  rows={domainRequestRows}
                />
              </SectionCard>

              <SectionCard eyebrow="Audit Filters" title="Governance evidence search">
                <div className="admin-filter-bar" aria-label="Audit filter controls">
                  <button type="button"><ListFilter size={15} /> action</button>
                  <button type="button" className="secondary-button"><Gauge size={15} /> severity</button>
                  <button type="button" className="secondary-button"><Route size={15} /> project</button>
                </div>
                <DataTable
                  columns={[
                    { key: "action", label: "Action" },
                    { key: "actor", label: "Actor" },
                    { key: "severity", label: "Severity", tone: () => "danger" }
                  ]}
                  rows={auditFilterRows}
                />
              </SectionCard>
            </section>
          </section>

          <ServiceStrip
            services={[
              { name: "Provider Adapter Registry", detail: "Mock and external adapter contracts ready", status: "healthy" },
              { name: "Secret Storage", detail: "Fingerprint only visible after save", status: "healthy" },
              { name: "Quota Guard", detail: "Hard stop before provider call", status: "healthy" },
              { name: "Guardrail Event Log", detail: "Blocked prompts recorded", status: "healthy" }
            ]}
          />
        </div>
      </section>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<AdminApp />);
