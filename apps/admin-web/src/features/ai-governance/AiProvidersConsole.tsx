import { Button, DataTable, DecisionPanel, MetricCard, PageHeader, SectionCard } from "@evcp/ui";
import type { AiQuotaDto, AiScenarioDto } from "@evcp/api-client";
import { useState } from "react";
import type { useAiGovernance } from "./use-ai-governance";
import { canMutateAiGovernance } from "./status";
import { routedScenariosByProvider, summaryCounts } from "./lib/derivations";
import { ProviderCard } from "./ProviderCard";
import { RoutingMatrix } from "./RoutingMatrix";
import { QuotaPanel } from "./QuotaPanel";
import { ProviderTestPanel } from "./ProviderTestPanel";
import { ProviderDrawer } from "./drawers/ProviderDrawer";
import { CredentialDrawer } from "./drawers/CredentialDrawer";
import { RouteDrawer } from "./drawers/RouteDrawer";
import { QuotaDrawer } from "./drawers/QuotaDrawer";

export function AiProvidersConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [message, setMessage] = useState<string>();
  const [lastTest, setLastTest] = useState<string>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [credentialProvider, setCredentialProvider] = useState<string | undefined>();
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [routeScenario, setRouteScenario] = useState<AiScenarioDto | undefined>();
  const [routeOpen, setRouteOpen] = useState(false);
  const [quotaScope, setQuotaScope] = useState<AiQuotaDto["scope"] | undefined>();
  const [quotaOpen, setQuotaOpen] = useState(false);

  const routedByProvider = routedScenariosByProvider(ai.routes);
  const counts = summaryCounts(ai.providers, ai.apiKeys, ai.routes);
  const done = (msg: string) => setMessage(msg);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI Governance"
        title="AI Providers"
        description="Govern which models power generation and how each scenario is routed."
      />
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => setProviderOpen(true)}>+ Add provider</Button>
      </div>

      <DecisionPanel
        tone={disabled ? "warning" : "success"}
        badge={ai.availability}
        title={message ?? ai.message}
        lines={["Provider secrets are sent only to Platform API and stored by the configured OpenBao-compatible secret store."]}
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Providers" value={String(counts.providers)} detail="registered endpoints" tone="success" />
        <MetricCard label="Active credentials" value={String(counts.activeCredentials)} detail="masked values only" tone="success" />
        <MetricCard label="Scenarios routed" value={`${counts.routed} / 6`} detail="of 6 generation scenarios" tone="success" />
        <MetricCard label="Last test" value={lastTest ? "ok" : "—"} detail={lastTest ?? "no test this session"} tone="success" />
      </section>

      <SectionCard eyebrow="Providers" title="Approved endpoints">
        {ai.providers.length === 0 ? (
          <p className="text-sm text-muted">No providers yet — add your first approved endpoint.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ai.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                credentials={ai.apiKeys.filter((k) => k.providerId === provider.id)}
                routedScenarios={routedByProvider[provider.id] ?? []}
                onAddCredential={(id) => { setCredentialProvider(id); setCredentialOpen(true); }}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <RoutingMatrix routes={ai.routes} providers={ai.providers} disabled={disabled}
        onConfigure={(scenario) => { setRouteScenario(scenario); setRouteOpen(true); }} />

      <QuotaPanel quotas={ai.quotas} disabled={disabled}
        onEdit={(scope) => { setQuotaScope(scope); setQuotaOpen(true); }} />

      <ProviderTestPanel ai={ai} disabled={disabled} onResult={setLastTest} />

      <SectionCard eyebrow="Records" title="Stored credentials">
        <DataTable
          columns={[{ key: "name", label: "Credential" }, { key: "providerId", label: "Provider" }, { key: "maskedValue", label: "Masked value" }, { key: "status", label: "Status" }]}
          rows={ai.apiKeys}
        />
      </SectionCard>

      <ProviderDrawer open={providerOpen} onClose={() => setProviderOpen(false)} ai={ai} onDone={done} />
      <CredentialDrawer open={credentialOpen} onClose={() => setCredentialOpen(false)} ai={ai} providerId={credentialProvider} onDone={done} />
      <RouteDrawer open={routeOpen} onClose={() => setRouteOpen(false)} ai={ai} scenario={routeScenario} onDone={done} />
      <QuotaDrawer open={quotaOpen} onClose={() => setQuotaOpen(false)} ai={ai} scope={quotaScope} onDone={done} />
    </section>
  );
}
