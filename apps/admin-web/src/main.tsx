import { navigation } from "@evcp/config";
import { mockUsers } from "@evcp/mock-data";
import { AppShell, DataTable, DecisionPanel, DefinitionGrid, MetricCard, PageHeader, SectionCard, ServiceStrip, ToneBadge, WorkflowRail } from "@evcp/ui";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
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
import { useEffect, type ComponentType } from "react";
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

const runtimeKpis = [
  { label: "Runtime Status", value: "running", detail: "separate generated app container", icon: ServerCog, tone: "success" },
  { label: "Schema Grant", value: "isolated", detail: "app_leave_management only", icon: Database, tone: "success" },
  { label: "Readiness", value: "5/5", detail: "auth, route, migration gates pass", icon: CheckCircle2, tone: "success" },
  { label: "Migration Dry Run", value: "passed", detail: "destructive changes require approval", icon: ShieldCheck, tone: "info" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const runtimeContractRows = [
  { area: "Artifact Root", contract: "generated-apps/leave-management", evidence: "app.manifest.json + README.md" },
  { area: "Container", contract: "evcp-app-leave-management-dep_001", evidence: "image leave-management:1" },
  { area: "Route", contract: "/apps/leave-management", evidence: "Caddy route registered" }
];

const runtimeEndpointRows = [
  { endpoint: "/apps/leave-management/health", signal: "healthy", owner: "Platform API" },
  { endpoint: "/apps/leave-management/ready", signal: "ready", owner: "Runtime gate" },
  { endpoint: "/apps/leave-management/metrics", signal: "p95 42ms", owner: "Metrics scraper" }
];

const runtimeLogRows = [
  { request: "req_leave_management_001", severity: "info", message: "Platform Auth session accepted" },
  { request: "req_leave_management_002", severity: "info", message: "Schema grant enforced for leave request query" }
];

const runtimeMetricRows = [
  { metric: "Requests", value: "128", window: "last 15m" },
  { metric: "Errors", value: "0", window: "last 15m" },
  { metric: "P95 Latency", value: "42ms", window: "last 15m" }
];

const knowledgeSkillKpis = [
  { label: "Knowledge active", value: "12", detail: "indexed and approved", icon: Database, tone: "success" },
  { label: "Pending approvals", value: "3", detail: "knowledge + skills", icon: AlertTriangle, tone: "warning" },
  { label: "Retrieval pass", value: "18/20", detail: "permission filtered", icon: Route, tone: "info" },
  { label: "Active skills", value: "9", detail: "role/scenario scoped", icon: BrainCircuit, tone: "success" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const knowledgeSourceRows = [
  { source: "HR Leave Policy Handbook", type: "Markdown", owner: "HR Owner", scope: "project:leave / dept:HR", index: "indexed", active: "v1" },
  { source: "Leave API Spec", type: "OpenAPI", owner: "App Owner", scope: "app:leave-management", index: "indexed", active: "v2" },
  { source: "Payroll Export Rules", type: "PDF", owner: "Finance", scope: "dept:Finance", index: "denied", active: "none" }
];

const skillLibraryRows = [
  { skill: "Frontend Developer Leave Skill", role: "Frontend Developer", scenario: "frontend_coding", status: "active" },
  { skill: "PRD Analyst Enterprise", role: "Requirement Analyst", scenario: "requirement_analysis", status: "active" },
  { skill: "Payroll Exporter", role: "Any role", scenario: "frontend_coding", status: "disabled" }
];

const skillAssignmentRows = [
  { role: "Frontend Developer", scenario: "Frontend Coding", scope: "project", selected: "Frontend Leave v1", knowledge: "HR Leave Policy v1" },
  { role: "Requirement Analyst", scenario: "Requirement Analysis", scope: "department", selected: "PRD Analyst v5", knowledge: "HR Handbook v3" }
];

const operationsRecoveryKpis = [
  { label: "Preflight Report", value: "passed", detail: "9/9 private-server checks", icon: ServerCog, tone: "success" },
  { label: "Setup Wizard", value: "complete", detail: "secrets masked", icon: LockKeyhole, tone: "success" },
  { label: "Backup Schedule", value: "enabled", detail: "daily 02:00 / 30d retention", icon: Database, tone: "info" },
  { label: "Restore Drill", value: "passed", detail: "RPO 60m / RTO 120m", icon: CheckCircle2, tone: "success" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const preflightRows = [
  { check: "CPU", required: ">= 4 cores", observed: "8 cores", status: "pass", action: "-" },
  { check: "RAM", required: ">= 8 GB", observed: "32 GB", status: "pass", action: "-" },
  { check: "Docker", required: "installed", observed: "26.1.0", status: "pass", action: "-" },
  { check: "Ports", required: "80/443/5432/6379/9000", observed: "all available", status: "pass", action: "-" }
];

const composeReadinessRows = [
  { service: "platform-api", status: "healthy", signal: "health endpoint ready" },
  { service: "admin-web", status: "healthy", signal: "admin bundle ready" },
  { service: "creator-web", status: "healthy", signal: "creator bundle ready" },
  { service: "app-store-pwa", status: "healthy", signal: "PWA bundle ready" },
  { service: "PostgreSQL / Keycloak / MinIO / Redis / Caddy", status: "healthy", signal: "compose readiness contract" }
];

const backupRunRows = [
  { run: "bckrun_nightly_postgres_001", status: "succeeded", artifact: "minio://evcp-backups/bckrun_nightly_postgres_001/evcp.dump.enc", checksum: "sha256:seed-backup-run-001", size: "2.4 GB" },
  { run: "bckrun_manual_s3_002", status: "succeeded", artifact: "s3://evcp-prod-backups/bckrun_manual_s3_002/evcp.dump.enc", checksum: "sha256:storage-neutral", size: "2.4 GB" }
];

const restoreValidationRows = [
  { check: "checksum", status: "pass", evidence: "artifact checksum verified" },
  { check: "schema", status: "pass", evidence: "Prisma schema current" },
  { check: "seed-records", status: "pass", evidence: "demo records restored" },
  { check: "audit-events", status: "pass", evidence: "critical restore audit retained" }
];

const observabilityLicenseKpis = [
  { label: "Service Health", value: "8/8", detail: "core services reporting", icon: Activity, tone: "success" },
  { label: "Telemetry Export", value: "OTLP", detail: "metrics/logs/traces/alerts", icon: Route, tone: "info" },
  { label: "License Validation", value: "active", detail: "offline cache until 2027-01-14", icon: Fingerprint, tone: "success" },
  { label: "License Enforcement", value: "guarded", detail: "privileged actions blocked after grace", icon: ShieldCheck, tone: "warning" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const productionServiceRows = [
  { service: "Platform API", type: "core", status: "healthy", signal: "p95 42ms", retention: "365d audit" },
  { service: "PostgreSQL", type: "database", status: "healthy", signal: "migration current", retention: "365d audit" },
  { service: "Keycloak", type: "auth", status: "healthy", signal: "realm evcp active", retention: "90d logs" },
  { service: "Redis + BullMQ", type: "queue", status: "healthy", signal: "0 delayed jobs", retention: "90d logs" }
];

const generatedAppHealthRows = [
  { app: "Leave Management", route: "/apps/leave-management", status: "healthy", readiness: "5/5 checks" },
  { app: "PRD Workspace Preview", route: "/preview/leave-management", status: "healthy", readiness: "schema isolated" }
];

const queueBackpressureRows = [
  { queue: "ai-tasks", depth: "0", oldest: "-", status: "healthy" },
  { queue: "builds", depth: "1", oldest: "00:01:12", status: "healthy" },
  { queue: "deployments", depth: "0", oldest: "-", status: "healthy" },
  { queue: "indexing", depth: "3", oldest: "00:02:05", status: "warning" }
];

const telemetryExportRows = [
  { signal: "metrics", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "logs", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "traces", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "alerts", endpoint: "otlp://observability.company.test:4317", status: "configured" }
];

const upgradeCompatibilityRows = [
  { check: "Disk space", observed: "20GB", required: ">=100GB", status: "blocked" },
  { check: "Last backup", observed: "failed", required: "succeeded", status: "blocked" },
  { check: "Service health", observed: "degraded", required: "healthy", status: "blocked" },
  { check: "License status", observed: "expired", required: "active / warning", status: "blocked" }
];

const licenseEnforcementRows = [
  { action: "publish", decision: "blocked", reason: "expired beyond grace", data: "preserved" },
  { action: "ai_generation", decision: "blocked", reason: "entitlement exceeded", data: "preserved" },
  { action: "new_external_invite", decision: "blocked", reason: "seat limit exceeded", data: "preserved" },
  { action: "run_existing_app", decision: "allowed", reason: "existing app continuity", data: "preserved" }
];

const securityReleaseKpis = [
  { label: "TLS Enforcement", value: "enforced", detail: "production HTTP blocked", icon: LockKeyhole, tone: "success" },
  { label: "Session Policy", value: "30m / 480m", detail: "no remember-me sessions", icon: ShieldCheck, tone: "success" },
  { label: "Secret Redaction", value: "passed", detail: "API, UI, log, audit, export", icon: KeyRound, tone: "success" },
  { label: "RTM Regression", value: "42/42", detail: "P0 requirements covered", icon: CheckCircle2, tone: "success" }
] satisfies Array<{ label: string; value: string; detail: string; icon: ComponentType<{ size?: number }>; tone: BadgeTone }>;

const tlsSessionRows = [
  { policy: "TLS Enforcement", required: "HTTPS in production", observed: "Caddy TLS route required", status: "pass" },
  { policy: "Local Setup HTTP", required: "allowed only for setup", observed: "localhost exception", status: "pass" },
  { policy: "Idle Timeout", required: "<= 30 minutes", observed: "30 minutes", status: "pass" },
  { policy: "Absolute Timeout", required: "<= 480 minutes", observed: "480 minutes", status: "pass" }
];

const secretRedactionRows = [
  { surface: "API", rule: "secret_key", evidence: "fingerprint or masked value only", status: "pass" },
  { surface: "UI", rule: "masked_value", evidence: "admin console never renders raw key", status: "pass" },
  { surface: "Log", rule: "structured_log_redaction", evidence: "prompt/ticket/request payload redacted", status: "pass" },
  { surface: "Audit", rule: "classification_filter", evidence: "rule names retained without secret values", status: "pass" }
];

const uploadValidationRows = [
  { file: "policy.pdf", mime: "application/pdf", scan: "clean", decision: "allowed" },
  { file: "payload.exe", mime: "application/x-msdownload", scan: "clean", decision: "blocked" },
  { file: "pending.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", scan: "pending", decision: "quarantined" },
  { file: "huge.pdf", mime: "application/pdf", scan: "clean", decision: "blocked" }
];

const releaseChecklistRows = [
  { check: "auth", public: "pass", external: "pass", blocker: "-" },
  { check: "permissions", public: "pass", external: "pass", blocker: "-" },
  { check: "domain", public: "pass", external: "pass", blocker: "-" },
  { check: "tls", public: "blocked", external: "pass", blocker: "TLS required before public exposure" },
  { check: "data_classification", public: "blocked", external: "pass", blocker: "Confidential data cannot be public" },
  { check: "audit", public: "pass", external: "pass", blocker: "-" }
];

const rtmRegressionRows = [
  { suite: "unit", scope: "security release service", result: "pass", evidence: "Sprint 14 service tests" },
  { suite: "integration", scope: "Prisma schema and seed contract", result: "pass", evidence: "security readiness tables" },
  { suite: "e2e", scope: "admin API + UI smoke", result: "pass", evidence: "admin readiness dashboard" }
];

function AdminApp() {
  useEffect(() => {
    if (!window.location.hash) {
      return;
    }

    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, []);

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

      <section className="runtime-hardening-shell" aria-label="Generated App Runtime Hardening">
        <div className="admin-monitoring-header">
          <div>
            <span className="eyebrow">Sprint 10</span>
            <h2>Generated App Runtime Hardening</h2>
            <p>หลักฐาน runtime สำหรับแอปที่ publish แล้ว: container แยก, schema-per-app, health/readiness, logs, metrics, OpenAPI และ migration dry-run.</p>
          </div>
          <ToneBadge tone="success">production contract</ToneBadge>
        </div>

        <section className="runtime-kpi-grid">
          {runtimeKpis.map((item) => {
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

        <section className="runtime-hardening-layout">
          <WorkflowRail
            eyebrow="Runtime Path"
            title="Publish to isolated app runtime"
            steps={[
              { label: "manifest contract", icon: <CheckCircle2 size={16} /> },
              { label: "container start", icon: <ServerCog size={16} /> },
              { label: "schema grant", icon: <Database size={16} /> },
              { label: "health and OpenAPI linked", icon: <Route size={16} /> }
            ]}
            alert={{
              icon: <ShieldCheck size={18} />,
              title: "Cross-schema access denied",
              description: "app_user_leave_management อ่านได้เฉพาะ schema ของแอปตัวเอง",
              tone: "warning"
            }}
          />

          <section className="runtime-hardening-grid">
            <SectionCard eyebrow="Artifact + Image" title="Container Contract">
              <div className="runtime-desktop-table">
                <DataTable
                  columns={[
                    { key: "area", label: "Area" },
                    { key: "contract", label: "Contract" },
                    { key: "evidence", label: "Evidence" }
                  ]}
                  rows={runtimeContractRows}
                />
              </div>
              <div className="runtime-mobile-list">
                {runtimeContractRows.map((row) => (
                  <article key={row.area}>
                    <strong>{row.area}</strong>
                    <span className="runtime-endpoint-text">{row.contract}</span>
                    <small>{row.evidence}</small>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Database Boundary" title="Schema Isolation">
              <DefinitionGrid
                items={[
                  { label: "Schema", value: "app_leave_management" },
                  { label: "DB User", value: "app_user_leave_management" },
                  { label: "Allowed", value: <ToneBadge tone="success">app schema only</ToneBadge> },
                  { label: "Denied", value: "public, platform, app_payroll" }
                ]}
              />
              <DecisionPanel
                tone="success"
                badge="Enforced"
                title="Runtime query cannot cross into another app schema"
                lines={["Schema grant evidence is linked to deployment", "Denied checks are auditable by project and operation"]}
              />
            </SectionCard>

            <SectionCard eyebrow="Runtime Probes" title="Health / Readiness">
              <div className="runtime-desktop-table">
                <DataTable
                  columns={[
                    { key: "endpoint", label: "Endpoint" },
                    { key: "signal", label: "Signal", tone: (value) => (value === "healthy" || value === "ready" ? "success" : "info") },
                    { key: "owner", label: "Owner" }
                  ]}
                  rows={runtimeEndpointRows}
                />
              </div>
              <div className="runtime-mobile-list">
                {runtimeEndpointRows.map((row) => (
                  <article key={row.endpoint}>
                    <strong className="runtime-endpoint-text">{row.endpoint}</strong>
                    <ToneBadge tone={row.signal === "healthy" || row.signal === "ready" ? "success" : "info"}>{row.signal}</ToneBadge>
                    <small>{row.owner}</small>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Structured Evidence" title="Structured Logs">
              <div className="runtime-desktop-table">
                <DataTable
                  columns={[
                    { key: "request", label: "Request" },
                    { key: "severity", label: "Severity", tone: () => "success" },
                    { key: "message", label: "Message" }
                  ]}
                  rows={runtimeLogRows}
                />
              </div>
              <div className="runtime-mobile-list">
                {runtimeLogRows.map((row) => (
                  <article key={row.request}>
                    <strong className="runtime-endpoint-text">{row.request}</strong>
                    <ToneBadge tone="success">{row.severity}</ToneBadge>
                    <small>{row.message}</small>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Operational Signals" title="Metrics">
              <DataTable
                columns={[
                  { key: "metric", label: "Metric" },
                  { key: "value", label: "Value", tone: (value) => (value === "0" ? "success" : "info") },
                  { key: "window", label: "Window" }
                ]}
                rows={runtimeMetricRows}
              />
            </SectionCard>

            <SectionCard eyebrow="API + Migration" title="OpenAPI Contract">
              <DefinitionGrid
                items={[
                  { label: "Spec", value: "generated-apps/leave-management/openapi/openapi.json" },
                  { label: "Version", value: "1.0.0" },
                  { label: "Paths", value: "/api/leave-requests, /api/approval-steps" },
                  { label: "Linked Deployment", value: "dep_leave_management_001" }
                ]}
              />
            </SectionCard>

            <SectionCard eyebrow="Database Change Gate" title="Migration Dry Run">
              <DecisionPanel
                tone="warning"
                badge="Approval Gate"
                title="Destructive migrations are blocked without reviewer and data owner approval"
                lines={["Non-destructive dry-run passes before deployment", "Drop column/table changes require Developer Reviewer and Data Owner"]}
              />
            </SectionCard>
          </section>
        </section>
      </section>

      <section className="knowledge-skill-governance-shell" aria-label="Knowledge and Skill Governance">
        <div className="admin-monitoring-header">
          <div>
            <span className="eyebrow">Sprint 11</span>
            <h2>Knowledge and Skill Governance</h2>
            <p>Govern approved knowledge retrieval and active skill selection for Creator AI workflows with immutable version and audit evidence.</p>
          </div>
          <div className="ds-page-actions">
            <button type="button" className="secondary-button">
              <ListFilter size={16} />
              Simulate
            </button>
            <button type="button">
              <Database size={16} />
              Add Source
            </button>
          </div>
        </div>

        <section className="knowledge-skill-kpi-grid">
          {knowledgeSkillKpis.map((item) => {
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

        <section className="knowledge-skill-layout">
          <WorkflowRail
            eyebrow="Governance Path"
            title="Knowledge to workspace context"
            steps={[
              { label: "upload source", icon: <Database size={16} /> },
              { label: "index version", icon: <CheckCircle2 size={16} /> },
              { label: "approve active", icon: <ShieldCheck size={16} /> },
              { label: "scoped retrieval", icon: <Route size={16} /> },
              { label: "select skill", icon: <BrainCircuit size={16} /> }
            ]}
            alert={{
              icon: <AlertTriangle size={18} />,
              title: "Pending versions are excluded",
              description: "Only approved active knowledge and skills can enter AI task metadata.",
              tone: "warning"
            }}
          />

          <section className="knowledge-skill-grid">
            <SectionCard eyebrow="Knowledge Library" title="Knowledge Source Library">
              <div className="governance-desktop-table">
                <DataTable
                  columns={[
                    { key: "source", label: "Source" },
                    { key: "type", label: "Type" },
                    { key: "owner", label: "Owner" },
                    { key: "scope", label: "Scope" },
                    { key: "index", label: "Index", tone: (value) => (value === "indexed" ? "success" : "danger") },
                    { key: "active", label: "Active" }
                  ]}
                  rows={knowledgeSourceRows}
                />
              </div>
              <div className="governance-mobile-list">
                {knowledgeSourceRows.map((row) => (
                  <article key={row.source}>
                    <strong>{row.source}</strong>
                    <span>{row.type} / {row.owner}</span>
                    <small>{row.scope}</small>
                    <ToneBadge tone={row.index === "indexed" ? "success" : "danger"}>{row.index}</ToneBadge>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Version Approval" title="Knowledge Version Approval">
              <DefinitionGrid
                items={[
                  { label: "Version", value: "HR Leave Policy Handbook v1" },
                  { label: "Immutable Hash", value: "sha256:seed-leave-policy-v1" },
                  { label: "Changelog", value: "Initial approved HR leave policy" },
                  { label: "Previous Active", value: "superseded safely" },
                  { label: "Approval", value: <ToneBadge tone="success">approved active</ToneBadge> },
                  { label: "Audit", value: "knowledge.version.approved" }
                ]}
              />
            </SectionCard>

            <SectionCard eyebrow="Scoped Retrieval" title="Retrieval Simulator">
              <div className="scope-filter-bar" aria-label="Knowledge retrieval filters">
                {["actor: creator@company.com", "project: Leave", "app: Leave Mgmt", "dept: HR", "agent: Frontend", "scenario: Frontend Coding"].map((filter) => (
                  <button key={filter} type="button" className="secondary-button">
                    <ListFilter size={14} />
                    {filter}
                  </button>
                ))}
              </div>
              <DecisionPanel
                tone="success"
                badge="ALLOW"
                title="Workspace Context resolves approved scoped knowledge"
                lines={["Matched: HR Leave Policy v1", "Excluded: Payroll Export Rules because department mismatch", "Retrieval log: knret_leave_policy_001"]}
              />
            </SectionCard>

            <SectionCard eyebrow="Skill Library" title="Skill Versioning">
              <div className="governance-desktop-table">
                <DataTable
                  columns={[
                    { key: "skill", label: "Skill" },
                    { key: "role", label: "Role" },
                    { key: "scenario", label: "Scenario" },
                    { key: "status", label: "Status", tone: (value) => (value === "active" ? "success" : "neutral") }
                  ]}
                  rows={skillLibraryRows}
                />
              </div>
              <div className="governance-mobile-list">
                {skillLibraryRows.map((row) => (
                  <article key={row.skill}>
                    <strong>{row.skill}</strong>
                    <span>{row.role}</span>
                    <small>{row.scenario}</small>
                    <ToneBadge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</ToneBadge>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="Skill Contract" title="Skill Assignment">
              <DataTable
                columns={[
                  { key: "role", label: "Role" },
                  { key: "scenario", label: "Scenario" },
                  { key: "scope", label: "Scope" },
                  { key: "selected", label: "Selected skill" },
                  { key: "knowledge", label: "Knowledge set" }
                ]}
                rows={skillAssignmentRows}
              />
            </SectionCard>

            <SectionCard eyebrow="Workspace Context" title="AI Task Metadata Evidence">
              <DefinitionGrid
                items={[
                  { label: "Skill Version", value: "skver_frontend_developer_leave_v1" },
                  { label: "Knowledge Versions", value: "knver_leave_policy_v1" },
                  { label: "Allowed Tools", value: "prd_reader, ui_generator, policy_checker" },
                  { label: "Task Evidence", value: "workspace.prompt.accepted" }
                ]}
              />
              <DecisionPanel
                tone="info"
                badge="Metadata"
                title="Creator prompts carry reproducible governance context"
                lines={["Task stores selected skillVersionId", "Task stores retrieved knowledgeVersionIds", "Provider calls remain deterministic in Sprint 11 tests"]}
              />
            </SectionCard>
          </section>
        </section>

        <ServiceStrip
          services={[
            { name: "Indexer", detail: "Approved versions indexed", status: "healthy" },
            { name: "Approval Policy", detail: "Pending and disabled versions excluded", status: "healthy" },
            { name: "Retrieval Logs", detail: "Actor, project, app and scenario retained", status: "healthy" },
            { name: "Audit Export", detail: "Knowledge and skill decisions traceable", status: "healthy" }
          ]}
        />
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

          <section id="operations-recovery" className="operations-recovery-shell" aria-label="Installer Backup Restore">
            <div className="operations-recovery-header">
              <div>
                <span className="eyebrow">Operations Recovery</span>
                <h2>Installer, Backup and Restore</h2>
                <p>Private-server readiness evidence for installer preflight, setup wizard, encrypted backups, PostgreSQL PITR and restore drills.</p>
              </div>
              <div className="ds-page-actions">
                <button type="button" className="secondary-button"><ServerCog size={16} /> Run Preflight</button>
                <button type="button"><CheckCircle2 size={16} /> Run Restore Drill</button>
              </div>
            </div>

            <section className="operations-recovery-kpi-grid">
              {operationsRecoveryKpis.map((item) => {
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

            <section className="operations-recovery-layout">
              <WorkflowRail
                title="Recovery Path"
                steps={[
                  { label: "installer preflight", icon: <ServerCog size={16} /> },
                  { label: "setup wizard", icon: <LockKeyhole size={16} /> },
                  { label: "compose readiness", icon: <Route size={16} /> },
                  { label: "backup schedule", icon: <Database size={16} /> },
                  { label: "backup run", icon: <ShieldCheck size={16} /> },
                  { label: "PostgreSQL PITR", icon: <Gauge size={16} /> },
                  { label: "restore drill", icon: <CheckCircle2 size={16} /> }
                ]}
                alert={{
                  icon: <AlertTriangle size={18} />,
                  title: "Failed checks block install",
                  description: "Restore drill failure never marks recovery as successful.",
                  tone: "warning"
                }}
              />

              <div className="operations-recovery-grid">
                <SectionCard eyebrow="Installer" title="Preflight Report">
                  <div className="operations-desktop-table">
                    <DataTable
                      columns={[
                        { key: "check", label: "Check" },
                        { key: "required", label: "Required" },
                        { key: "observed", label: "Observed" },
                        { key: "status", label: "Status", tone: () => "success" },
                        { key: "action", label: "Action" }
                      ]}
                      rows={preflightRows}
                    />
                  </div>
                  <div className="backup-restore-mobile-list">
                    {preflightRows.map((row) => (
                      <article key={row.check}>
                        <strong>{row.check}</strong>
                        <span>Required: {row.required}</span>
                        <span>Observed: {row.observed}</span>
                        <ToneBadge tone="success">{row.status}</ToneBadge>
                      </article>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard eyebrow="Setup Wizard" title="Deployment configuration">
                  <DefinitionGrid
                    items={[
                      { label: "Domain", value: "platform.company.test" },
                      { label: "Database", value: "postgresql://evcp:***@postgres:5432/evcp" },
                      { label: "Storage", value: "MinIO / S3-compatible contract" },
                      { label: "Auth", value: "Keycloak broker ready" },
                      { label: "AI + Guardrail", value: "external provider route + enterprise policy" },
                      { label: "First Admin", value: "admin@company.com" }
                    ]}
                  />
                  <DecisionPanel
                    tone="success"
                    badge="masked"
                    title="Setup Wizard completed without exposing secrets"
                    lines={["Database password masked", "Storage and backup encryption use key references only"]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Compose" title="Docker Compose Readiness">
                  <DataTable
                    columns={[
                      { key: "service", label: "Service" },
                      { key: "status", label: "Status", tone: () => "success" },
                      { key: "signal", label: "Signal" }
                    ]}
                    rows={composeReadinessRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Backup Schedule" title="Encrypted backup policy">
                  <DefinitionGrid
                    items={[
                      { label: "Target", value: "minio://evcp-backups" },
                      { label: "Retention", value: "30 days" },
                      { label: "Schedule", value: "0 2 * * *" },
                      { label: "Encryption", value: "kms://evcp/backup" },
                      { label: "State", value: <ToneBadge tone="success">enabled</ToneBadge> }
                    ]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Backup Runs" title="Artifact evidence">
                  <DataTable
                    columns={[
                      { key: "run", label: "Run" },
                      { key: "status", label: "Status", tone: () => "success" },
                      { key: "artifact", label: "Artifact" },
                      { key: "checksum", label: "Checksum" },
                      { key: "size", label: "Size" }
                    ]}
                    rows={backupRunRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="PostgreSQL PITR" title="Point-in-time recovery">
                  <DefinitionGrid
                    items={[
                      { label: "WAL retention", value: "72 hours" },
                      { label: "Base backup", value: "bckrun_nightly_postgres_001" },
                      { label: "Target timestamp", value: "2026-09-15T02:03:00.000Z" },
                      { label: "RPO / RTO", value: "60m / 120m" },
                      { label: "Status", value: <ToneBadge tone="success">ready</ToneBadge> }
                    ]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Restore Drill" title="Recovery Evidence">
                  <DecisionPanel
                    tone="success"
                    badge="passed"
                    title="Restore Drill verified selected backup and PITR metadata"
                    lines={["Report: restore_drill_001", "Critical failure path is audited when validation fails"]}
                  />
                  <DataTable
                    columns={[
                      { key: "check", label: "Validation" },
                      { key: "status", label: "Status", tone: () => "success" },
                      { key: "evidence", label: "Evidence" }
                    ]}
                    rows={restoreValidationRows}
                  />
                </SectionCard>
              </div>
            </section>

            <ServiceStrip
              services={[
                { name: "Installer Report", detail: "Preflight and compose readiness retained", status: "healthy" },
                { name: "Setup Audit", detail: "Secrets masked and audited", status: "healthy" },
                { name: "Storage Contract", detail: "MinIO and S3-compatible targets", status: "healthy" },
                { name: "PITR Metadata", detail: "WAL retention and target timestamp recorded", status: "healthy" },
                { name: "Admin-only APIs", detail: "Creator and End User denied", status: "healthy" }
              ]}
            />
          </section>

          <section id="observability-license" className="observability-license-shell" aria-label="Observability and License">
            <div className="observability-license-header">
              <div>
                <span className="eyebrow">Production Control</span>
                <h2>Observability and License</h2>
                <p>Admin evidence for production health, generated app signals, queue backpressure, telemetry export, upgrade safety and signed license enforcement.</p>
              </div>
              <div className="ds-page-actions">
                <button type="button" className="secondary-button"><Activity size={16} /> Export Health</button>
                <button type="button"><Fingerprint size={16} /> Validate License</button>
              </div>
            </div>

            <section className="observability-license-kpi-grid">
              {observabilityLicenseKpis.map((item) => {
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

            <section className="observability-license-layout">
              <WorkflowRail
                title="Production Gate"
                steps={[
                  { label: "Service Health", icon: <Activity size={16} /> },
                  { label: "Generated App Health", icon: <ServerCog size={16} /> },
                  { label: "Queue Backpressure", icon: <Gauge size={16} /> },
                  { label: "Telemetry Export", icon: <Route size={16} /> },
                  { label: "Upgrade Compatibility", icon: <ShieldCheck size={16} /> },
                  { label: "Rollback Report", icon: <Database size={16} /> },
                  { label: "License Validation", icon: <Fingerprint size={16} /> },
                  { label: "License Enforcement", icon: <LockKeyhole size={16} /> }
                ]}
                alert={{
                  icon: <AlertTriangle size={18} />,
                  title: "License blocks privileged actions only",
                  description: "Existing apps keep running and data is preserved when expiry or quota enforcement applies.",
                  tone: "warning"
                }}
              />

              <div className="observability-license-grid">
                <SectionCard eyebrow="Production" title="Service Health">
                  <DataTable
                    columns={[
                      { key: "service", label: "Service" },
                      { key: "type", label: "Type" },
                      { key: "status", label: "Status", tone: () => "success" },
                      { key: "signal", label: "Signal" },
                      { key: "retention", label: "Retention" }
                    ]}
                    rows={productionServiceRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Generated Apps" title="Generated App Health">
                  <DataTable
                    columns={[
                      { key: "app", label: "App" },
                      { key: "route", label: "Route" },
                      { key: "status", label: "Status", tone: () => "success" },
                      { key: "readiness", label: "Readiness" }
                    ]}
                    rows={generatedAppHealthRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Queues" title="Queue Backpressure">
                  <DataTable
                    columns={[
                      { key: "queue", label: "Queue" },
                      { key: "depth", label: "Depth" },
                      { key: "oldest", label: "Oldest job" },
                      { key: "status", label: "Status", tone: (value) => (value === "warning" ? "warning" : "success") }
                    ]}
                    rows={queueBackpressureRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Telemetry" title="Telemetry Export">
                  <DataTable
                    columns={[
                      { key: "signal", label: "Signal" },
                      { key: "endpoint", label: "Endpoint" },
                      { key: "status", label: "Status", tone: () => "info" }
                    ]}
                    rows={telemetryExportRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Upgrade" title="Upgrade Compatibility">
                  <div className="observability-desktop-table">
                    <DataTable
                      columns={[
                        { key: "check", label: "Check" },
                        { key: "observed", label: "Observed" },
                        { key: "required", label: "Required" },
                        { key: "status", label: "Status", tone: () => "danger" }
                      ]}
                      rows={upgradeCompatibilityRows}
                    />
                  </div>
                  <DecisionPanel
                    tone="danger"
                    badge="blocked"
                    title="Unsafe upgrade cannot continue"
                    lines={["Report: upgrade_check_001", "Blocking reasons are retained for PO and IT Admin acceptance"]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Rollback" title="Rollback Report">
                  <DefinitionGrid
                    items={[
                      { label: "Report", value: "rollback_report_001" },
                      { label: "From / To", value: "1.1.1 -> 1.1.0" },
                      { label: "Status", value: <ToneBadge tone="success">succeeded</ToneBadge> },
                      { label: "Window ends", value: "2026-10-05T12:00:00.000Z" },
                      { label: "Path", value: "reports/rollback/rollback_report_001.json" }
                    ]}
                  />
                </SectionCard>

                <SectionCard eyebrow="License" title="License Validation">
                  <DefinitionGrid
                    items={[
                      { label: "License", value: "license_enterprise_2026" },
                      { label: "Edition", value: "enterprise" },
                      { label: "Seat / App Limit", value: "100 seats / 25 apps" },
                      { label: "AI entitlement", value: "1,000,000 tokens/month" },
                      { label: "Offline cache", value: "valid until 2027-01-14" },
                      { label: "Secret handling", value: "fingerprint only" }
                    ]}
                  />
                </SectionCard>

                <SectionCard eyebrow="License" title="License Enforcement">
                  <div className="observability-desktop-table">
                    <DataTable
                      columns={[
                        { key: "action", label: "Action" },
                        { key: "decision", label: "Decision", tone: (value) => (value === "allowed" ? "success" : "warning") },
                        { key: "reason", label: "Reason" },
                        { key: "data", label: "Data" }
                      ]}
                      rows={licenseEnforcementRows}
                    />
                  </div>
                  <div className="license-enforcement-mobile-list">
                    {licenseEnforcementRows.map((row) => (
                      <article key={row.action}>
                        <strong>{row.action}</strong>
                        <ToneBadge tone={row.decision === "allowed" ? "success" : "warning"}>{row.decision}</ToneBadge>
                        <span>{row.reason}</span>
                        <small>Data: {row.data}</small>
                      </article>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </section>

            <ServiceStrip
              services={[
                { name: "Health Dashboard", detail: "Platform and generated app signals visible", status: "healthy" },
                { name: "Telemetry Contract", detail: "OTLP export configured", status: "healthy" },
                { name: "Upgrade Gate", detail: "Unsafe upgrade blocked", status: "degraded" },
                { name: "License Guard", detail: "Signed payload and offline cache enforced", status: "healthy" },
                { name: "Data Continuity", detail: "Existing apps remain available", status: "healthy" }
              ]}
            />
          </section>

          <section id="security-release" className="security-release-shell" aria-label="Security Release Readiness">
            <div className="security-release-header">
              <div>
                <span className="eyebrow">Security Release Gate</span>
                <h2>Security Release Readiness</h2>
                <p>Admin-only readiness for TLS, session controls, secret redaction, upload quarantine, public/external exposure checks, sensitive log redaction and RTM regression evidence.</p>
              </div>
              <div className="ds-page-actions">
                <button type="button" className="secondary-button"><ListFilter size={16} /> Export Evidence</button>
                <button type="button"><ShieldCheck size={16} /> Run Checklist</button>
              </div>
            </div>

            <section className="security-release-kpi-grid">
              {securityReleaseKpis.map((item) => {
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

            <section className="security-release-layout">
              <WorkflowRail
                title="Release Gate"
                steps={[
                  { label: "TLS Enforcement", icon: <LockKeyhole size={16} /> },
                  { label: "Session Policy", icon: <ShieldCheck size={16} /> },
                  { label: "Secret Redaction", icon: <KeyRound size={16} /> },
                  { label: "Upload Validation", icon: <Database size={16} /> },
                  { label: "Public / External Checklist", icon: <Globe2 size={16} /> },
                  { label: "Sensitive Log Redaction", icon: <Fingerprint size={16} /> },
                  { label: "RTM Regression", icon: <CheckCircle2 size={16} /> }
                ]}
                alert={{
                  icon: <AlertTriangle size={18} />,
                  title: "Public release is blocked",
                  description: "Public exposure waits for TLS plus data classification approval; external release remains available when all checks pass.",
                  tone: "warning"
                }}
              />

              <div className="security-release-grid">
                <SectionCard eyebrow="Transport + Auth" title="TLS Enforcement and Session Policy">
                  <DataTable
                    columns={[
                      { key: "policy", label: "Policy" },
                      { key: "required", label: "Required" },
                      { key: "observed", label: "Observed" },
                      { key: "status", label: "Status", tone: () => "success" }
                    ]}
                    rows={tlsSessionRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Secrets" title="Secret Redaction">
                  <DataTable
                    columns={[
                      { key: "surface", label: "Surface" },
                      { key: "rule", label: "Rule" },
                      { key: "evidence", label: "Evidence" },
                      { key: "status", label: "Status", tone: () => "success" }
                    ]}
                    rows={secretRedactionRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Uploads" title="Upload Validation">
                  <DataTable
                    columns={[
                      { key: "file", label: "File" },
                      { key: "mime", label: "MIME" },
                      { key: "scan", label: "Scan" },
                      { key: "decision", label: "Decision", tone: (value) => (value === "allowed" ? "success" : value === "quarantined" ? "warning" : "danger") }
                    ]}
                    rows={uploadValidationRows}
                  />
                </SectionCard>

                <SectionCard eyebrow="Exposure" title="Public / External Checklist">
                  <div className="security-release-desktop-table">
                    <DataTable
                      columns={[
                        { key: "check", label: "Check" },
                        { key: "public", label: "Public", tone: (value) => (value === "blocked" ? "danger" : "success") },
                        { key: "external", label: "External", tone: (value) => (value === "blocked" ? "danger" : "success") },
                        { key: "blocker", label: "Blocker" }
                      ]}
                      rows={releaseChecklistRows}
                    />
                  </div>
                  <div className="security-release-mobile-list">
                    {releaseChecklistRows.map((row) => (
                      <article key={row.check}>
                        <strong>{row.check}</strong>
                        <ToneBadge tone={row.public === "blocked" ? "danger" : "success"}>Public: {row.public}</ToneBadge>
                        <ToneBadge tone={row.external === "blocked" ? "danger" : "success"}>External: {row.external}</ToneBadge>
                        <small>{row.blocker}</small>
                      </article>
                    ))}
                  </div>
                  <DecisionPanel
                    tone="warning"
                    badge="blocked"
                    title="Sensitive public release waits for security approval"
                    lines={["TLS must be enforced before public exposure", "Confidential data cannot move to public without an approved exception"]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Logging" title="Sensitive Log Redaction">
                  <DefinitionGrid
                    items={[
                      { label: "Prompt", value: "secret keys and national IDs redacted" },
                      { label: "Ticket", value: "passwords and card numbers redacted" },
                      { label: "Request Payload", value: "apiKey/clientSecret values replaced" },
                      { label: "Audit", value: "classification and rule names only" }
                    ]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Traceability" title="RTM Regression">
                  <DataTable
                    columns={[
                      { key: "suite", label: "Suite" },
                      { key: "scope", label: "Scope" },
                      { key: "result", label: "Result", tone: () => "success" },
                      { key: "evidence", label: "Evidence" }
                    ]}
                    rows={rtmRegressionRows}
                  />
                </SectionCard>
              </div>
            </section>

            <ServiceStrip
              services={[
                { name: "Admin-only APIs", detail: "Readiness, upload, release and redaction endpoints guarded", status: "healthy" },
                { name: "Upload Quarantine", detail: "Unsupported, oversize and unsafe scan states handled", status: "healthy" },
                { name: "Public Gate", detail: "TLS and data classification block unsafe exposure", status: "degraded" },
                { name: "Redaction Evidence", detail: "Sensitive values removed before response or audit", status: "healthy" },
                { name: "RTM Regression", detail: "P0 traceability ready for PO acceptance", status: "healthy" }
              ]}
            />
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
