import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type AiProviderTestCallInput,
  type AiProviderTestCallResponse,
  type CurrentUserResponse,
  type InstallerPreflightInput,
  type InstallerReportDto,
  type InstallerSetupResponse,
  type SimulatedSsoLoginInput
} from "@evcp/api-client";
import { navigation } from "@evcp/config";
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
import { useEffect, useState, type ChangeEvent, type ComponentType } from "react";
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

type InstallWizardStepId = "prepare_server" | "configure_environment" | "preflight" | "setup" | "deploy_stack" | "migrate_seed" | "verify_health" | "first_admin_login";
type InstallWizardDecision = "ready" | "blocked" | "not_run";
type InstallWizardStepStatus = "current" | "complete" | "blocked" | "pending";
type PreflightRow = { check: string; required: string; observed: string; status: string; action: string };
type InstallWizardState = {
  decision: InstallWizardDecision;
  source: string;
  activeStep: InstallWizardStepId;
  rows: PreflightRow[];
  actionableFailures: string[];
  reportPath: string;
  setupStatus: "pending" | "saved";
};
type InstallJourneyStep = {
  id: InstallWizardStepId;
  label: string;
  detail: string;
  owner: string;
  evidence: string;
  nextAction: string;
  status: InstallWizardStepStatus;
};
type InstallWizardSetupForm = {
  domain: string;
  databaseUrl: string;
  storageProvider: string;
  storageEndpoint: string;
  storageBucket: string;
  storageSecretAccessKey: string;
  authMode: string;
  authIssuerUrl: string;
  aiProviderId: string;
  aiModel: string;
  guardrailPolicy: string;
  backupSchedule: string;
  backupRetentionDays: string;
  backupEncryptionKeyRef: string;
  firstAdminEmail: string;
  firstAdminName: string;
};

type AdminBootstrapState = {
  userName: string;
  source: "Platform API" | "local fallback";
};

const initialAdminBootstrap: AdminBootstrapState = {
  userName: "Platform Admin",
  source: "local fallback"
};

const adminSessionBridgeProfile: SimulatedSsoLoginInput = {
  subject: "keycloak-admin-ui-bridge",
  email: "admin@company.com",
  name: "Platform Admin",
  groups: ["evcp-admins"],
  appRoles: {}
};

const initialInstallerSetupForm: InstallWizardSetupForm = {
  domain: "platform.company.test",
  databaseUrl: "postgresql://evcp:REPLACE_ME@postgres:5432/evcp",
  storageProvider: "minio",
  storageEndpoint: "http://minio:9000",
  storageBucket: "evcp-artifacts",
  storageSecretAccessKey: "replace-me",
  authMode: "keycloak",
  authIssuerUrl: "http://keycloak:8080/realms/evcp",
  aiProviderId: "aip_openai",
  aiModel: "gpt-4.1",
  guardrailPolicy: "enterprise-default",
  backupSchedule: "0 2 * * *",
  backupRetentionDays: "30",
  backupEncryptionKeyRef: "kms://evcp/backup",
  firstAdminEmail: "admin@company.com",
  firstAdminName: "Platform Admin"
};

const installWizardSteps = [
  { id: "prepare_server", label: "1. Prepare Server", detail: "CPU, RAM, disk, Docker, ports, DNS/TLS, network" },
  { id: "configure_environment", label: "2. Configure Environment", detail: ".env, secrets, domain, Caddy and compose contract" },
  { id: "preflight", label: "3. Run Preflight", detail: "installer checks produce pass/fail report evidence" },
  { id: "setup", label: "4. Save Setup", detail: "domain, database, storage, auth, AI, backup, first admin" },
  { id: "deploy_stack", label: "5. Deploy Stack", detail: "Docker Compose starts platform and infrastructure services" },
  { id: "migrate_seed", label: "6. Migrate + Seed", detail: "Prisma migration and seed plan is ready" },
  { id: "verify_health", label: "7. Verify Health", detail: "Platform surfaces and dependencies report healthy" },
  { id: "first_admin_login", label: "8. First Admin Login", detail: "Platform Auth session proves Admin Console is usable" }
] satisfies Array<{ id: InstallWizardStepId; label: string; detail: string }>;

const installWizardPassingProfile = {
  cpuCores: 8,
  memoryGb: 32,
  diskFreeGb: 500,
  os: "ubuntu-22.04",
  dockerVersion: "26.1.0",
  composeVersion: "2.27.0",
  portsAvailable: [80, 443, 5432, 6379, 9000],
  dnsReady: true,
  tlsReady: true,
  networkReady: true
};

const installWizardBlockedProfile = {
  cpuCores: 1,
  memoryGb: 2,
  diskFreeGb: 10,
  os: "",
  dockerVersion: "",
  composeVersion: "",
  portsAvailable: [],
  dnsReady: false,
  tlsReady: false,
  networkReady: false
};

const installWizardReadyRows: PreflightRow[] = [
  { check: "CPU", required: ">= 4 cores", observed: "8 cores", status: "pass", action: "-" },
  { check: "RAM", required: ">= 8 GB", observed: "32 GB", status: "pass", action: "-" },
  { check: "Disk", required: ">= 100 GB free", observed: "500 GB", status: "pass", action: "-" },
  { check: "Docker", required: "Docker installed", observed: "26.1.0", status: "pass", action: "-" },
  { check: "Ports", required: "80/443/5432/6379/9000", observed: "all available", status: "pass", action: "-" }
];

const installWizardBlockedRows: PreflightRow[] = [
  { check: "CPU", required: ">= 4 cores", observed: "1 core", status: "fail", action: "Add CPU capacity before install" },
  { check: "RAM", required: ">= 8 GB", observed: "2 GB", status: "fail", action: "Add memory before install" },
  { check: "Disk", required: ">= 100 GB free", observed: "10 GB", status: "fail", action: "Increase free disk space" },
  { check: "Docker", required: "Docker installed", observed: "missing", status: "fail", action: "Install Docker Engine" },
  { check: "Network", required: "Outbound and internal network ready", observed: "not ready", status: "fail", action: "Fix network connectivity" }
];

const initialInstallWizardState: InstallWizardState = {
  decision: "not_run" as InstallWizardDecision,
  source: "not run",
  activeStep: "prepare_server",
  rows: installWizardReadyRows,
  actionableFailures: ["Run preflight before marking install ready"],
  reportPath: "reports/install/pending-install-report.json",
  setupStatus: "pending" as "pending" | "saved"
};

function setupItemsFromConfig(form: InstallWizardSetupForm, savedSetup?: InstallerSetupResponse) {
  const retentionDays = Number.parseInt(form.backupRetentionDays, 10) || 30;
  return [
    { label: "Domain", value: savedSetup?.domain ?? form.domain },
    { label: "Database", value: savedSetup?.databaseUrlMasked ?? form.databaseUrl.replace(/:[^:@/]+@/, ":***@") },
    { label: "Storage", value: `${savedSetup?.storage?.provider ?? form.storageProvider} bucket ${savedSetup?.storage?.bucket ?? form.storageBucket} / key fingerprint only` },
    { label: "Auth", value: `${savedSetup?.auth?.mode ?? form.authMode} / ${savedSetup?.auth?.issuerUrl ?? form.authIssuerUrl}` },
    { label: "AI Provider", value: `${savedSetup?.ai?.providerId ?? form.aiProviderId} / ${savedSetup?.ai?.model ?? form.aiModel}` },
    { label: "Backup", value: `${form.backupSchedule} / ${retentionDays}d / ${form.backupEncryptionKeyRef}` },
    { label: "First Admin", value: String(savedSetup?.firstAdmin?.email ?? form.firstAdminEmail) }
  ];
}

function preflightRowsFromReport(report: InstallerReportDto | undefined, fallback: PreflightRow[]): PreflightRow[] {
  if (!report?.checks?.length) return fallback;
  return report.checks.map((check) => ({
    check: check.name,
    required: check.required,
    observed: check.observed,
    status: check.status,
    action: check.action
  }));
}

function apiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  if (!configured && import.meta.env.DEV) return undefined;
  return (configured || "/api").replace(/\/$/, "");
}

function platformSessionToken(): string | undefined {
  return createPlatformSessionStore(window.localStorage).getToken();
}

function createAdminPlatformClient() {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
    legacyUserEmail: "admin@company.com"
  });
}

async function loadAdminBootstrap(): Promise<AdminBootstrapState> {
  const client = createAdminPlatformClient();
  const currentUser: CurrentUserResponse = await client.getCurrentUser();
  return {
    userName: currentUser.user.name,
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

async function signInAdminSessionBridge(): Promise<AdminBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const bridgeClient = createPlatformApiClient({
    baseUrl,
    legacyUserEmail: "admin@company.com"
  });
  const session = await bridgeClient.simulateSsoLogin(adminSessionBridgeProfile);
  createPlatformSessionStore(window.localStorage).saveSession(session);
  return loadAdminBootstrap();
}

function clearAdminSessionBridge(): AdminBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return initialAdminBootstrap;
}

async function runInstallerPreflight(profile: InstallerPreflightInput): Promise<InstallerReportDto> {
  return createAdminPlatformClient().runInstallerPreflight(profile);
}

async function saveInstallerSetup(form: InstallWizardSetupForm): Promise<InstallerSetupResponse> {
  return createAdminPlatformClient().saveInstallerSetup({
    domain: form.domain,
    databaseUrl: form.databaseUrl,
    storage: {
      provider: form.storageProvider,
      endpoint: form.storageEndpoint,
      bucket: form.storageBucket,
      secretAccessKey: form.storageSecretAccessKey
    },
    auth: {
      mode: form.authMode,
      issuerUrl: form.authIssuerUrl
    },
    ai: {
      providerId: form.aiProviderId,
      model: form.aiModel
    },
    guardrail: {
      defaultPolicy: form.guardrailPolicy,
      blockHighRisk: true
    },
    backup: {
      schedule: form.backupSchedule,
      retentionDays: Number.parseInt(form.backupRetentionDays, 10) || 30,
      encryptionMode: "kms",
      encryptionKeyRef: form.backupEncryptionKeyRef
    },
    firstAdmin: {
      email: form.firstAdminEmail,
      displayName: form.firstAdminName
    }
  });
}

async function listInstallerReports(): Promise<InstallerReportDto[]> {
  return createAdminPlatformClient().listInstallerReports();
}

async function runProviderTestCall(input: AiProviderTestCallInput): Promise<AiProviderTestCallResponse> {
  return createAdminPlatformClient().testAiProvider(input);
}

function installWizardStepIndex(stepId: InstallWizardStepId): number {
  return installWizardSteps.findIndex((step) => step.id === stepId);
}

function installWizardStepStatus(activeStep: InstallWizardStepId, stepId: InstallWizardStepId, decision: InstallWizardDecision, setupSaved: boolean): InstallWizardStepStatus {
  if (decision === "blocked" && stepId === "preflight") return "blocked";
  if (stepId === "setup" && setupSaved) return "complete";
  const activeIndex = installWizardStepIndex(activeStep);
  const stepIndex = installWizardStepIndex(stepId);
  if (stepId === activeStep) return "current";
  if (decision === "ready" && stepIndex < activeIndex) return "complete";
  return "pending";
}

function buildInstallJourneySteps(installWizard: InstallWizardState, setupSaved: boolean, latestInstallerReport?: InstallerReportDto): InstallJourneyStep[] {
  const metadata: Record<InstallWizardStepId, Omit<InstallJourneyStep, "status">> = {
    prepare_server: {
      id: "prepare_server",
      label: "Prepare Server",
      detail: "Supported private server profile and network are ready before install.",
      owner: "System Admin",
      evidence: "Docker host: CPU/RAM/disk/ports/DNS/TLS profile",
      nextAction: "Prepare private server capacity and replace example secrets"
    },
    configure_environment: {
      id: "configure_environment",
      label: "Configure Environment",
      detail: "Environment, public domain, Caddy route and compose service contract are reviewed.",
      owner: "IT Admin",
      evidence: ".env + docker/docker-compose.yml + VITE_PLATFORM_API_BASE_URL",
      nextAction: "Review .env, domain, ports and external AI provider values"
    },
    preflight: {
      id: "preflight",
      label: "Run Preflight",
      detail: "Installer preflight records pass/fail readiness and actionable remediation.",
      owner: "IT Admin",
      evidence: `POST /admin/installer/preflight -> ${latestInstallerReport?.reportPath ?? installWizard.reportPath}`,
      nextAction: "Run Preflight"
    },
    setup: {
      id: "setup",
      label: "Save Setup",
      detail: "Admin saves masked setup evidence without rendering plaintext secrets.",
      owner: "Platform Admin",
      evidence: "POST /admin/installer/setup -> masked setup evidence",
      nextAction: "Save Setup"
    },
    deploy_stack: {
      id: "deploy_stack",
      label: "Deploy Stack",
      detail: "Private-server platform services are started through the compose contract.",
      owner: "System Admin",
      evidence: "docker compose --env-file .env -f docker/docker-compose.yml up -d",
      nextAction: "Deploy Stack"
    },
    migrate_seed: {
      id: "migrate_seed",
      label: "Migrate + Seed",
      detail: "Database schema and initial records are applied after services are up.",
      owner: "Platform API",
      evidence: "pnpm --filter @evcp/platform-api exec prisma migrate deploy + seed",
      nextAction: "Run Prisma migrate deploy and seed"
    },
    verify_health: {
      id: "verify_health",
      label: "Verify Health",
      detail: "API, Admin, Creator, Store and dependencies report healthy readiness.",
      owner: "IT Admin",
      evidence: "GET /health + Caddy /api/* route + service readiness",
      nextAction: "Verify Health"
    },
    first_admin_login: {
      id: "first_admin_login",
      label: "First Admin Login",
      detail: "First admin session proves the installed Admin Console is usable.",
      owner: "Platform Admin",
      evidence: "GET /api/auth/me with Platform Auth session",
      nextAction: "First Admin Login"
    }
  };

  return installWizardSteps.map((step) => ({
    ...metadata[step.id],
    label: step.label.replace(/^\d+\.\s*/, ""),
    status: installWizardStepStatus(installWizard.activeStep, step.id, installWizard.decision, setupSaved)
  }));
}

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
  const [bootstrap, setBootstrap] = useState(initialAdminBootstrap);
  const [installWizard, setInstallWizard] = useState(initialInstallWizardState);
  const [installerSetupForm, setInstallerSetupForm] = useState(initialInstallerSetupForm);
  const [savedInstallerSetup, setSavedInstallerSetup] = useState<InstallerSetupResponse | undefined>(undefined);
  const [installerReports, setInstallerReports] = useState<InstallerReportDto[]>([]);
  const [providerTestCallResult, setProviderTestCallResult] = useState<AiProviderTestCallResponse | undefined>(undefined);
  const [providerTestCallMessage, setProviderTestCallMessage] = useState("Run a dry-run provider test before Creator traffic depends on this route.");
  const [isRunningInstallCheck, setIsRunningInstallCheck] = useState(false);
  const [isSavingInstallerSetup, setIsSavingInstallerSetup] = useState(false);
  const [isRunningProviderTestCall, setIsRunningProviderTestCall] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    loadAdminBootstrap()
      .then(setBootstrap)
      .catch(() => setBootstrap(initialAdminBootstrap));

    listInstallerReports()
      .then(setInstallerReports)
      .catch(() => setInstallerReports([]));
  }, []);

  useEffect(() => {
    if (!window.location.hash) {
      return;
    }

    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, []);

  async function handleRunInstallerPreflight(kind: "ready" | "blocked") {
    setIsRunningInstallCheck(true);
    const fallbackRows = kind === "ready" ? installWizardReadyRows : installWizardBlockedRows;
    try {
      const report = await runInstallerPreflight(kind === "ready" ? installWizardPassingProfile : installWizardBlockedProfile);
      const reports = await listInstallerReports().catch(() => []);
      setInstallerReports(reports);
      setInstallWizard({
        decision: report?.installBlocked ? "blocked" : "ready",
        source: "Platform API",
        activeStep: report?.installBlocked ? "preflight" : "setup",
        rows: preflightRowsFromReport(report, fallbackRows),
        actionableFailures: report?.actionableFailures.length ? report.actionableFailures : ["All install checks passed"],
        reportPath: report?.reportPath ?? "reports/install/private-server-install-report.json",
        setupStatus: savedInstallerSetup ? "saved" : "pending"
      });
    } catch {
      setInstallWizard({
        decision: kind === "ready" ? "ready" : "blocked",
        source: "local fallback",
        activeStep: kind === "ready" ? "setup" : "preflight",
        rows: fallbackRows,
        actionableFailures: kind === "ready" ? ["All install checks passed"] : fallbackRows.filter((row) => row.status === "fail").map((row) => `${row.check}: ${row.action}`),
        reportPath: `reports/install/${kind === "ready" ? "passed" : "failed"}-install-report.json`,
        setupStatus: savedInstallerSetup ? "saved" : "pending"
      });
    } finally {
      setIsRunningInstallCheck(false);
    }
  }

  async function handleSaveInstallerSetup() {
    setIsSavingInstallerSetup(true);
    try {
      const setup = await saveInstallerSetup(installerSetupForm);
      setSavedInstallerSetup(setup);
      setInstallerSetupForm((current) => ({
        ...current,
        domain: setup.domain,
        databaseUrl: setup.databaseUrlMasked,
        storageSecretAccessKey: ""
      }));
      setInstallWizard((current) => ({
        ...current,
        source: "Platform API",
        activeStep: current.decision === "blocked" ? "preflight" : "deploy_stack",
        setupStatus: "saved",
        actionableFailures: current.decision === "blocked" ? current.actionableFailures : ["Setup saved with masked secrets", "Compose readiness can be reviewed next"]
      }));
    } catch {
      setInstallWizard((current) => ({
        ...current,
        activeStep: current.decision === "blocked" ? "preflight" : "setup",
        setupStatus: "pending",
        actionableFailures: ["Setup save failed; review API connectivity and required fields"]
      }));
    } finally {
      setIsSavingInstallerSetup(false);
    }
  }

  async function handleRunProviderTestCall() {
    setIsRunningProviderTestCall(true);
    setProviderTestCallMessage("Provider test is running through the governed AI Gateway route.");
    try {
      const result = await runProviderTestCall({
        scenario: "prd_generation",
        prompt: "Validate provider route before Creator PRD generation",
        dryRun: true
      });
      setProviderTestCallResult(result);
      setProviderTestCallMessage("Provider route validated. Output excerpt and usage evidence are safe to show.");
    } catch (error) {
      setProviderTestCallResult(undefined);
      setProviderTestCallMessage(error instanceof Error ? error.message : "Provider test failed. Review route, active key and adapter setup.");
    } finally {
      setIsRunningProviderTestCall(false);
    }
  }

  function handleWizardNext() {
    setInstallWizard((current) => {
      if (current.decision === "blocked") return current;
      const nextStep = installWizardSteps[Math.min(installWizardStepIndex(current.activeStep) + 1, installWizardSteps.length - 1)]?.id ?? current.activeStep;
      return {
        ...current,
        activeStep: nextStep,
        decision: nextStep === "first_admin_login" && current.setupStatus === "saved" ? "ready" : current.decision
      };
    });
  }

  function handleWizardBack() {
    setInstallWizard((current) => {
      const previousStep = installWizardSteps[Math.max(installWizardStepIndex(current.activeStep) - 1, 0)]?.id ?? current.activeStep;
      return { ...current, activeStep: previousStep };
    });
  }

  function handleInstallerSetupField(field: keyof InstallWizardSetupForm, event: ChangeEvent<HTMLInputElement>) {
    setInstallerSetupForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      setBootstrap(await signInAdminSessionBridge());
    } catch {
      setBootstrap(initialAdminBootstrap);
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleLogoutBridge() {
    setBootstrap(clearAdminSessionBridge());
  }

  const installWizardSetupItems = setupItemsFromConfig(installerSetupForm, savedInstallerSetup);
  const latestInstallerReport = installerReports[installerReports.length - 1];
  const installJourneyRows = buildInstallJourneySteps(installWizard, Boolean(savedInstallerSetup), latestInstallerReport);

  return (
    <AppShell title="EVCP Admin" navItems={navigation.admin} userName={bootstrap.userName}>
      <PageHeader
        eyebrow="AI Governance"
        title="ศูนย์ควบคุม AI Providers & API Keys"
        description="ควบคุม provider, secret, routing, quota และ guardrail ของทุก AI call ก่อนใช้งานจริงในองค์กร"
        actions={
          <>
          <ToneBadge tone={bootstrap.source === "Platform API" ? "success" : "neutral"}>Session: {bootstrap.source}</ToneBadge>
          <button type="button" className="secondary-button" onClick={handleSignInBridge} disabled={isSigningIn}>
            <Fingerprint size={16} />
            {isSigningIn ? "Signing in" : "Demo Sign in"}
          </button>
          <button type="button" className="secondary-button" onClick={handleLogoutBridge}>
            <LockKeyhole size={16} />
            Logout
          </button>
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
          <SectionCard
            eyebrow="Provider Test Call"
            title="Validate AI provider route"
            action={
              <button type="button" className="secondary-button" onClick={handleRunProviderTestCall} disabled={isRunningProviderTestCall}>
                <Route size={15} /> {isRunningProviderTestCall ? "Running" : "Run Provider Test"}
              </button>
            }
          >
            <div className="provider-test-call-panel" aria-label="Provider test-call panel">
              <div className="provider-test-call-summary">
                <div className="ds-summary-row">
                  <div className="ds-summary-icon"><BrainCircuit size={22} /></div>
                  <div>
                    <strong>{providerTestCallResult?.providerName ?? "Configured PRD provider route"}</strong>
                    <span>{providerTestCallMessage}</span>
                  </div>
                  <ToneBadge tone={providerTestCallResult ? (providerTestCallResult.fallbackUsed ? "warning" : "success") : isRunningProviderTestCall ? "info" : "neutral"}>
                    {providerTestCallResult ? providerTestCallResult.status : isRunningProviderTestCall ? "pending" : "not run"}
                  </ToneBadge>
                </div>
                <DefinitionGrid
                  items={[
                    { label: "Scenario", value: "prd_generation" },
                    { label: "Mode", value: "dry-run by default" },
                    { label: "Adapter", value: providerTestCallResult?.adapter ?? "provider adapter" },
                    { label: "Model", value: providerTestCallResult?.model ?? "configured route" },
                    { label: "Usage Log", value: providerTestCallResult?.usageLogId ?? "created after run" },
                    { label: "Latency", value: providerTestCallResult ? `${providerTestCallResult.latencyMs}ms` : "pending" }
                  ]}
                />
              </div>
              <DecisionPanel
                tone={providerTestCallResult ? (providerTestCallResult.fallbackUsed ? "warning" : "success") : "info"}
                badge={providerTestCallResult ? (providerTestCallResult.fallbackUsed ? "fallback" : "validated") : "safe dry-run"}
                title={providerTestCallResult ? "Adapter route returned governed output" : "No plaintext secret is displayed"}
                lines={[
                  providerTestCallResult?.outputExcerpt ?? "Click Run Provider Test to validate route, key, adapter, token usage and usage-log creation.",
                  providerTestCallResult ? `Tokens: ${providerTestCallResult.tokensUsed} / fallback: ${providerTestCallResult.fallbackUsed ? "yes" : "no"}` : "Response will show provider evidence without raw key material."
                ]}
              />
            </div>
          </SectionCard>

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
                <p>First-run install wizard, private-server readiness evidence, encrypted backups, PostgreSQL PITR and restore drills.</p>
              </div>
              <div className="ds-page-actions">
                <button type="button" className="secondary-button" onClick={() => handleRunInstallerPreflight("blocked")} disabled={isRunningInstallCheck}>
                  <AlertTriangle size={16} /> Simulate Blocked Preflight
                </button>
                <button type="button" onClick={() => handleRunInstallerPreflight("ready")} disabled={isRunningInstallCheck}>
                  <ServerCog size={16} /> {isRunningInstallCheck ? "Running Preflight" : "Run Preflight"}
                </button>
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
                  { label: "prepare server", icon: <ServerCog size={16} /> },
                  { label: "configure environment", icon: <Route size={16} /> },
                  { label: "run preflight", icon: <CheckCircle2 size={16} /> },
                  { label: "save setup", icon: <LockKeyhole size={16} /> },
                  { label: "deploy stack", icon: <Route size={16} /> },
                  { label: "migrate and seed", icon: <Database size={16} /> },
                  { label: "verify health", icon: <CheckCircle2 size={16} /> },
                  { label: "first admin login", icon: <Fingerprint size={16} /> },
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
                <SectionCard eyebrow="First-run Install Wizard" title="Private-server install readiness">
                  <div className="install-journey-shell" aria-label="First-run installation journey">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">First-run Installation Journey</span>
                        <h2>Ordered private-server install path</h2>
                      </div>
                      <ToneBadge tone={installWizard.decision === "blocked" ? "danger" : installWizard.decision === "ready" ? "success" : "warning"}>
                        {installWizard.decision === "blocked" ? "blocked" : installWizard.decision === "ready" ? "ready" : "not run"}
                      </ToneBadge>
                    </div>
                    <div className="install-journey-board">
                      {installJourneyRows.map((step) => (
                        <article key={step.id} className={`install-journey-card status-${step.status}`}>
                          <div className="install-journey-card-header">
                            <strong>{step.label}</strong>
                            <ToneBadge tone={step.status === "complete" ? "success" : step.status === "blocked" ? "danger" : step.status === "current" ? "info" : "neutral"}>
                              {step.status}
                            </ToneBadge>
                          </div>
                          <p>{step.detail}</p>
                          <dl className="install-journey-meta">
                            <div>
                              <dt>Owner</dt>
                              <dd>{step.owner}</dd>
                            </div>
                            <div>
                              <dt>Evidence</dt>
                              <dd>{step.evidence}</dd>
                            </div>
                            <div>
                              <dt>Next Action</dt>
                              <dd>{step.nextAction}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="install-wizard-panel" aria-label="First-run install wizard">
                    <ol className="install-wizard-steps">
                      {installWizardSteps.map((step) => {
                        const status = installWizardStepStatus(installWizard.activeStep, step.id, installWizard.decision, Boolean(savedInstallerSetup));
                        return (
                          <li key={step.id} className={status === "current" ? "active" : `status-${status}`}>
                            <span>{step.label}</span>
                            <small>{step.detail}</small>
                            <ToneBadge tone={status === "complete" ? "success" : status === "blocked" ? "danger" : status === "current" ? "info" : "neutral"}>{status}</ToneBadge>
                          </li>
                        );
                      })}
                    </ol>
                    <DecisionPanel
                      tone={installWizard.decision === "ready" ? "success" : installWizard.decision === "blocked" ? "danger" : "warning"}
                      badge={installWizard.decision === "ready" ? "ready" : installWizard.decision === "blocked" ? "blocked" : "pending"}
                      title={installWizard.decision === "ready" ? "Install can proceed after setup review" : installWizard.decision === "blocked" ? "Install blocked by failed preflight checks" : "Run preflight before install"}
                      lines={[
                        `Evidence source: ${installWizard.source}`,
                        `Report: ${installWizard.reportPath}`,
                        ...installWizard.actionableFailures.slice(0, 3)
                      ]}
                    />
                    <div className="install-wizard-action-row" aria-label="Install wizard step controls">
                      <button type="button" className="secondary-button" onClick={handleWizardBack} disabled={installWizard.activeStep === "prepare_server"}>
                        <Route size={16} /> Back
                      </button>
                      <button type="button" className="secondary-button" onClick={handleWizardNext} disabled={installWizard.decision === "blocked" || installWizard.activeStep === "first_admin_login"}>
                        <CheckCircle2 size={16} /> Next Step
                      </button>
                      <ToneBadge tone={latestInstallerReport?.status === "failed" ? "danger" : latestInstallerReport ? "success" : "neutral"}>
                        Latest report: {latestInstallerReport?.status ?? "none"}
                      </ToneBadge>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard eyebrow="Setup Wizard" title="Deployment configuration">
                  <div className="install-setup-form" aria-label="Installer setup configuration form">
                    <label>
                      Domain
                      <input value={installerSetupForm.domain} onChange={(event) => handleInstallerSetupField("domain", event)} />
                    </label>
                    <label>
                      Database URL
                      <input value={installerSetupForm.databaseUrl} onChange={(event) => handleInstallerSetupField("databaseUrl", event)} />
                    </label>
                    <label>
                      Storage Endpoint
                      <input value={installerSetupForm.storageEndpoint} onChange={(event) => handleInstallerSetupField("storageEndpoint", event)} />
                    </label>
                    <label>
                      Storage Bucket
                      <input value={installerSetupForm.storageBucket} onChange={(event) => handleInstallerSetupField("storageBucket", event)} />
                    </label>
                    <label>
                      Storage Secret
                      <input type="password" value={installerSetupForm.storageSecretAccessKey} placeholder={savedInstallerSetup ? "saved as masked evidence" : "required before save"} onChange={(event) => handleInstallerSetupField("storageSecretAccessKey", event)} />
                    </label>
                    <label>
                      Auth Issuer
                      <input value={installerSetupForm.authIssuerUrl} onChange={(event) => handleInstallerSetupField("authIssuerUrl", event)} />
                    </label>
                    <label>
                      AI Provider / Model
                      <input value={`${installerSetupForm.aiProviderId} / ${installerSetupForm.aiModel}`} onChange={(event) => {
                        const [providerId, model] = event.target.value.split("/").map((item) => item.trim());
                        setInstallerSetupForm((current) => ({ ...current, aiProviderId: providerId || current.aiProviderId, aiModel: model || current.aiModel }));
                      }} />
                    </label>
                    <label>
                      First Admin Email
                      <input value={installerSetupForm.firstAdminEmail} onChange={(event) => handleInstallerSetupField("firstAdminEmail", event)} />
                    </label>
                  </div>
                  <div className="install-wizard-action-row">
                    <button type="button" onClick={handleSaveInstallerSetup} disabled={isSavingInstallerSetup || installWizard.decision === "blocked"}>
                      <LockKeyhole size={16} /> {isSavingInstallerSetup ? "Saving Setup" : "Save Setup"}
                    </button>
                    <ToneBadge tone={savedInstallerSetup ? "success" : "warning"}>{installWizard.setupStatus === "saved" ? "saved" : "pending save"}</ToneBadge>
                  </div>
                  <DefinitionGrid
                    items={installWizardSetupItems}
                  />
                  <DecisionPanel
                    tone={savedInstallerSetup ? "success" : "warning"}
                    badge={savedInstallerSetup ? "masked" : "draft"}
                    title={savedInstallerSetup ? "Setup evidence is ready without exposing secrets" : "Save setup before compose verification"}
                    lines={savedInstallerSetup ? ["Database password masked", "Storage, AI and backup keys use fingerprints or key references only", "First admin is visible for audit review"] : ["Draft values are editable", "Save setup through Platform API before treating install as configured"]}
                  />
                </SectionCard>

                <SectionCard eyebrow="Installer" title="Preflight Report">
                  <div className="operations-desktop-table">
                    <DataTable
                      columns={[
                        { key: "check", label: "Check" },
                        { key: "required", label: "Required" },
                        { key: "observed", label: "Observed" },
                        { key: "status", label: "Status", tone: (value) => (value === "pass" ? "success" : "danger") },
                        { key: "action", label: "Action" }
                      ]}
                      rows={installWizard.rows}
                    />
                  </div>
                  <div className="backup-restore-mobile-list">
                    {installWizard.rows.map((row) => (
                      <article key={row.check}>
                        <strong>{row.check}</strong>
                        <span>Required: {row.required}</span>
                        <span>Observed: {row.observed}</span>
                        <span>Action: {row.action}</span>
                        <ToneBadge tone={row.status === "pass" ? "success" : "danger"}>{row.status}</ToneBadge>
                      </article>
                    ))}
                  </div>
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
