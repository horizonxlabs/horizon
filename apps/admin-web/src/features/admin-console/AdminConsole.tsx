import { type PlatformApiError, type PlatformUserSummary } from "@evcp/api-client";
import { navigation } from "@evcp/config";
import { AppShell, DataTable, DecisionPanel, MetricCard, PageHeader, SectionCard, ServiceStrip } from "@evcp/ui";
import { BrainCircuit, CheckCircle2, KeyRound, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminRoutes } from "@/routes/AdminRoutes";
import { canMutateAiGovernance, useAiGovernance } from "@/features/ai-governance";
import { AuditEvidenceSection } from "@/features/audit-monitoring";
import { authProviderRows } from "@/features/auth-sso";
import { installWizardSteps } from "@/features/installer-operations";
import { knowledgeSourceRows } from "@/features/knowledge-skills";
import { observabilityLicenseKpis, productionServiceRows } from "@/features/observability-licensing";
import { serviceHealthRows } from "@/features/platform-operations";
import { domainRequestRows } from "@/features/publish-governance";
import { runtimeContractRows } from "@/features/runtime-hardening";
import { securityReleaseKpis } from "@/features/security-release-readiness";
import { buildCreateUserPayload, generateTempPassword } from "@/features/user-management";
import { clearAdminSession, createAdminPlatformClient, hasValidAdminSession } from "@/shared/platform-client";

const dashboardKpis = [
  { label: "Provider พร้อมใช้งาน", value: "2", detail: "OpenAI + Anthropic fallback", icon: BrainCircuit },
  { label: "API Key ที่ active", value: "1", detail: "fingerprint only", icon: KeyRound },
  { label: "Route สำหรับ PRD", value: "Ready", detail: "primary + fallback", icon: Route },
  { label: "Guardrail blocks", value: "1", detail: "24h ล่าสุด", icon: ShieldCheck }
];

function pageFromPath(pathname: string) {
  if (pathname.includes("/services")) return "services";
  if (pathname.includes("/ai-providers")) return "ai-providers";
  if (pathname.includes("/guardrails")) return "guardrails";
  if (pathname.includes("/audit-logs")) return "audit-logs";
  if (pathname.includes("/users")) return "users";
  return "dashboard";
}

export function AdminConsole() {
  const [setupStatus, setSetupStatus] = useState<"loading" | "incomplete" | "complete">("loading");
  const [sessionActive, setSessionActive] = useState(hasValidAdminSession());
  const [user, setUser] = useState({ email: "admin@company.com", name: "Platform Admin", role: "admin", tempPassword: "" });
  const [createdUser, setCreatedUser] = useState<{ summary: PlatformUserSummary; tempPassword: string }>();
  const [userError, setUserError] = useState("");
  const client = useMemo(() => (sessionActive ? createAdminPlatformClient() : undefined), [sessionActive]);
  const ai = useAiGovernance(client);
  const page = pageFromPath(window.location.pathname);

  useEffect(() => {
    createAdminPlatformClient().getSetupStatus()
      .then((status) => setSetupStatus(status.setupCompleted ? "complete" : "incomplete"))
      .catch(() => setSetupStatus("incomplete"));
  }, []);

  if (setupStatus === "loading") {
    return <AdminRoutes setupStatus={setupStatus} sessionActive={sessionActive} onSetupComplete={() => setSetupStatus("complete")} onLoggedIn={() => setSessionActive(true)}><main className="first-run-shell"><span className="eyebrow">Loading…</span></main></AdminRoutes>;
  }
  if (setupStatus === "incomplete" || !sessionActive) {
    return <AdminRoutes setupStatus={setupStatus} sessionActive={sessionActive} onSetupComplete={() => setSetupStatus("complete")} onLoggedIn={() => setSessionActive(true)} />;
  }

  const createUser = async () => {
    setUserError("");
    try {
      const payload = buildCreateUserPayload(user);
      const summary = await createAdminPlatformClient().createUser(payload);
      setCreatedUser({ summary, tempPassword: payload.tempPassword });
      setUser({ email: "", name: "", role: "creator", tempPassword: "" });
    } catch (error) {
      const apiError = error as PlatformApiError;
      setUserError(apiError.message || "User creation failed");
    }
  };
  const content = page === "audit-logs" ? <AuditEvidenceSection /> : page === "users" ? <UserCreation user={user} setUser={setUser} error={userError} created={createdUser} onCreate={createUser} /> : page === "ai-providers" || page === "guardrails" ? <AiGovernancePanel ai={ai} /> : <OperationsDashboard page={page} />;
  return <AdminRoutes setupStatus={setupStatus} sessionActive={sessionActive} onSetupComplete={() => setSetupStatus("complete")} onLoggedIn={() => setSessionActive(true)}><AppShell title="Horizon Admin" navItems={navigation.admin} userName="Platform Admin" environmentLabel="Online Private Server" session={<button type="button" className="secondary-button" onClick={() => { clearAdminSession(); setSessionActive(false); }}><LockKeyhole size={16} />Logout</button>}><PageHeader eyebrow="Administration" title="Platform control center" description="Private server operations, governance and evidence." />{content}</AppShell></AdminRoutes>;
}

function OperationsDashboard({ page }: { page: string }) {
  const rows = page === "services" ? serviceHealthRows : productionServiceRows;
  return <section className="admin-page-stack"><section className="ds-metric-grid">{dashboardKpis.map(({ icon: Icon, ...item }) => <MetricCard key={item.label} {...item} icon={<Icon size={18} />} tone="success" />)}</section><SectionCard eyebrow="Operations" title={page === "services" ? "Service health" : "Production evidence"}><DataTable columns={[{ key: "service", label: "Service" }, { key: "status", label: "Status", tone: () => "success" }, { key: "signal", label: "Signal" }]} rows={rows.map((row) => ({ service: row.service, status: row.status, signal: row.signal }))} /></SectionCard><SectionCard eyebrow="Installer" title="First-run installation journey"><DataTable columns={[{ key: "label", label: "Step" }, { key: "owner", label: "Owner" }, { key: "evidence", label: "Evidence" }]} rows={installWizardSteps.map((step) => ({ label: step.label, owner: "IT Admin", evidence: step.id }))} /></SectionCard><EvidenceOverview /></section>;
}

function EvidenceOverview() {
  return <section className="ds-grid-2"><SectionCard eyebrow="Auth / SSO" title="Provider registry"><DataTable columns={[{ key: "provider", label: "Provider" }, { key: "status", label: "Status" }]} rows={authProviderRows} /></SectionCard><SectionCard eyebrow="Knowledge" title="Approved sources"><DataTable columns={[{ key: "source", label: "Source" }, { key: "index", label: "Index" }]} rows={knowledgeSourceRows} /></SectionCard><SectionCard eyebrow="Runtime" title="Runtime contracts"><DataTable columns={[{ key: "contract", label: "Contract" }, { key: "evidence", label: "Evidence" }]} rows={runtimeContractRows} /></SectionCard><SectionCard eyebrow="Publishing" title="Domain requests"><DataTable columns={[{ key: "domain", label: "Domain" }, { key: "status", label: "Status" }]} rows={domainRequestRows} /></SectionCard><SectionCard eyebrow="Security" title="Release gates">{securityReleaseKpis.map((item) => <p key={item.label}><CheckCircle2 size={14} /> {item.label}: {item.value}</p>)}</SectionCard><SectionCard eyebrow="Observability" title="License health">{observabilityLicenseKpis.map((item) => <p key={item.label}>{item.label}: {item.value}</p>)}</SectionCard><ServiceStrip services={[{ name: "Platform API", detail: "Prisma persistence and API routes healthy", status: "healthy" }, { name: "Admin Console", detail: "First-run setup gate ready", status: "healthy" }, { name: "Creator Workspace", detail: "Route-scoped pages active", status: "healthy" }]} /></section>;
}

function AiGovernancePanel({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  return <section className="admin-page-stack"><DecisionPanel tone={disabled ? "warning" : "success"} badge={ai.availability} title={ai.message} lines={["Configuration changes are disabled until Platform API data is available."]} /><section className="ds-grid-2"><SectionCard eyebrow="Provider Registry" title="External AI Providers"><DataTable columns={[{ key: "name", label: "Provider" }, { key: "adapter", label: "Adapter" }, { key: "status", label: "Status" }]} rows={ai.providers} /></SectionCard><SectionCard eyebrow="Guardrails" title="Latest events"><DataTable columns={[{ key: "id", label: "Event" }, { key: "decision", label: "Decision" }, { key: "occurredAt", label: "Time" }]} rows={ai.guardrailEvents} /></SectionCard></section></section>;
}

function UserCreation({ user, setUser, error, created, onCreate }: { user: { email: string; name: string; role: string; tempPassword: string }; setUser: (value: typeof user) => void; error: string; created?: { summary: PlatformUserSummary; tempPassword: string }; onCreate: () => Promise<void> }) {
  const update = (field: keyof typeof user, value: string) => setUser({ ...user, [field]: value });
  return <SectionCard eyebrow="Create Account" title="Create Creator account"><div className="ai-governance-action-panel compact"><label>Email<input type="email" value={user.email} onChange={(event) => update("email", event.target.value)} /></label><label>Name<input value={user.name} onChange={(event) => update("name", event.target.value)} /></label><label>Temp Password<input value={user.tempPassword} onChange={(event) => update("tempPassword", event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => update("tempPassword", generateTempPassword())}><KeyRound size={15} />Generate</button><button type="button" onClick={() => void onCreate()} disabled={!user.email || !user.name || !user.tempPassword}><ShieldCheck size={15} />Create User</button></div>{error ? <DecisionPanel tone="danger" badge="error" title={error} lines={["Fix the field above and try again."]} /> : null}{created ? <DecisionPanel tone="success" badge="temp password" title="Give this to the Creator — they'll change it on first login" lines={[`Email: ${created.summary.email}`, `Temporary password: ${created.tempPassword}`]} /> : null}</SectionCard>;
}
