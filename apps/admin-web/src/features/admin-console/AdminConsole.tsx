import { navigation } from "@evcp/config";
import {
  AppShell,
  DataTable,
  DecisionPanel,
  MetricCard,
  navigateBrowserPath,
  PageHeader,
  SectionCard,
  ServiceStrip,
  useBrowserPath,
  usePageHeadingFocus
} from "@evcp/ui";
import { BrainCircuit, KeyRound, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AdminRoutes } from "@/routes/AdminRoutes";
import { AiProvidersConsole, useAiGovernance } from "@/features/ai-governance";
import { GuardrailsConsole } from "@/features/guardrails";
import { AuditEvidenceSection } from "@/features/audit-monitoring";
import { AuthSettingsPage } from "@/features/auth-sso";
import { DomainReadinessPage } from "@/features/domain-management";
import { KnowledgeSkillsConsole } from "@/features/knowledge-skills";
import {
  DomainPanel,
  SystemUpdatePanel,
  useProductionObservability
} from "@/features/platform-operations";
import { UsersConsole } from "@/features/user-management";
import {
  clearAdminSession,
  consumeAdminSessionHandoff,
  createAdminPlatformClient,
  hasValidAdminSession,
  startAdminKeycloakLogout
} from "@/shared/platform-client";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { adminPageFromPath } from "./admin-routes";

export function AdminConsole({ publishingPage }: { publishingPage: ReactNode }) {
  const [setupStatus, setSetupStatus] = useState<"loading" | "incomplete" | "complete">("loading");
  const [sessionActive, setSessionActive] = useState(
    () => consumeAdminSessionHandoff() || hasValidAdminSession()
  );
  const client = useMemo(
    () =>
      sessionActive
        ? createAdminPlatformClient(() => {
            clearAdminSession();
            setSessionActive(false);
          })
        : undefined,
    [sessionActive]
  );
  const ai = useAiGovernance(client);
  const pathname = useBrowserPath();
  usePageHeadingFocus(pathname);
  const page = adminPageFromPath(pathname);

  useEffect(() => {
    createAdminPlatformClient()
      .getSetupStatus()
      .then((status) => setSetupStatus(status.setupCompleted ? "complete" : "incomplete"))
      .catch(() => setSetupStatus("incomplete"));
  }, []);

  if (setupStatus === "loading") {
    return (
      <AdminRoutes
        setupStatus={setupStatus}
        sessionActive={sessionActive}
        onSetupComplete={() => setSetupStatus("complete")}
        onLoggedIn={() => setSessionActive(true)}
      >
        <main className="first-run-shell">
          <span className="eyebrow">Loading…</span>
        </main>
      </AdminRoutes>
    );
  }
  if (setupStatus === "incomplete" || !sessionActive) {
    return (
      <AdminRoutes
        setupStatus={setupStatus}
        sessionActive={sessionActive}
        onSetupComplete={() => setSetupStatus("complete")}
        onLoggedIn={() => setSessionActive(true)}
      />
    );
  }

  const content =
    page === "audit-logs" && client ? (
      <AuditEvidenceSection client={client} />
    ) : page === "users" && client ? (
      <UsersConsole client={client} />
    ) : page === "knowledge" && client ? (
      <KnowledgeSkillsConsole client={client} />
    ) : page === "system" && client ? (
      <SystemUpdatePanel client={client} />
    ) : page === "domain" && client ? (
      <DomainPanel client={client} />
    ) : page === "ai-providers" ? (
      <AiProvidersConsole ai={ai} />
    ) : page === "guardrails" ? (
      <GuardrailsConsole ai={ai} />
    ) : page === "auth" ? (
      <AuthSettingsPage />
    ) : page === "domains" ? (
      <DomainReadinessPage />
    ) : page === "publishing" ? (
      publishingPage
    ) : page === "not-found" ? (
      <DecisionPanel
        tone="warning"
        badge="Not found"
        title="Admin page not found"
        lines={["Choose a destination from the administration navigation."]}
      />
    ) : (
      <OperationsDashboard
        client={client}
        ai={ai}
        page={page === "services" ? "services" : "dashboard"}
      />
    );
  return (
    <AdminRoutes
      setupStatus={setupStatus}
      sessionActive={sessionActive}
      onSetupComplete={() => setSetupStatus("complete")}
      onLoggedIn={() => setSessionActive(true)}
    >
      <AppShell
        title="Horizon Admin"
        logo={<HorizonLogo className="admin-sidebar-logo" />}
        navItems={navigation.admin}
        currentPath={pathname}
        onNavigate={(route) => navigateBrowserPath(route)}
        userName="Platform Admin"
        environmentLabel="Online Private Server"
        session={
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void client
                ?.request("/auth/logout", { method: "POST" })
                .catch(() => undefined)
                .finally(() => {
                  clearAdminSession();
                  setSessionActive(false);
                  window.location.assign(startAdminKeycloakLogout());
                });
            }}
          >
            <LockKeyhole size={16} />
            Logout
          </button>
        }
      >
        {page === "ai-providers" ||
        page === "guardrails" ||
        page === "users" ||
        page === "knowledge" ||
        page === "system" ||
        page === "domain" ||
        page === "auth" ||
        page === "domains" ||
        page === "publishing" ||
        page === "not-found" ? null : (
          <PageHeader
            eyebrow="Administration"
            title="Platform control center"
            description="Private server operations, governance and evidence."
          />
        )}
        {content}
      </AppShell>
    </AdminRoutes>
  );
}

function OperationsDashboard({
  client,
  ai,
  page
}: {
  client: ReturnType<typeof createAdminPlatformClient> | undefined;
  ai: ReturnType<typeof useAiGovernance>;
  page: "dashboard" | "services";
}) {
  const operations = useProductionObservability(client);
  const kpis = [
    {
      label: "Provider พร้อมใช้งาน",
      value: String(ai.providers.length),
      detail: ai.message,
      icon: BrainCircuit
    },
    {
      label: "API Key ที่ active",
      value: String(ai.apiKeys.length),
      detail: "masked values only",
      icon: KeyRound
    },
    {
      label: "Service healthy",
      value: String(operations.serviceHealth.filter((item) => item.status === "healthy").length),
      detail: operations.message,
      icon: Route
    },
    {
      label: "Queues degraded",
      value: String(operations.queueHealth.filter((item) => item.status !== "healthy").length),
      detail: "from Platform API",
      icon: ShieldCheck
    }
  ];
  return (
    <section className="admin-page-stack">
      {operations.status !== "ready" ? (
        <DecisionPanel
          tone="warning"
          badge={operations.status}
          title={operations.message}
          lines={[
            "Health and queue evidence is loaded from Platform API; unavailable data never falls back to demo success."
          ]}
        />
      ) : null}
      <section className="ds-metric-grid">
        {kpis.map(({ icon: Icon, ...item }) => (
          <MetricCard
            key={item.label}
            {...item}
            icon={<Icon size={18} />}
            tone={operations.status === "ready" ? "success" : "warning"}
          />
        ))}
      </section>
      <ServiceStrip
        services={operations.serviceHealth.map(({ name, detail, status }) => ({
          name,
          detail,
          status: status === "failed" ? "down" : status
        }))}
      />
      <SectionCard
        eyebrow="Operations"
        title={page === "services" ? "Service health" : "Production evidence"}
      >
        <DataTable
          columns={[
            { key: "name", label: "Service" },
            { key: "status", label: "Status" },
            { key: "detail", label: "Signal" }
          ]}
          rows={operations.serviceHealth}
        />
      </SectionCard>
      <SectionCard eyebrow="Queues" title="Current backpressure">
        <DataTable
          columns={[
            { key: "name", label: "Queue" },
            { key: "depth", label: "Depth" },
            { key: "failedCount", label: "Failed" },
            { key: "status", label: "Status" }
          ]}
          rows={operations.queueHealth}
        />
      </SectionCard>
    </section>
  );
}
