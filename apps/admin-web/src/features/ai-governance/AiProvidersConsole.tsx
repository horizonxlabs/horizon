import { Badge, Button, DecisionPanel, MetricCard, PageHeader, SectionCard, Tabs } from "@evcp/ui";
import type { AiApiKeyDto, AiQuotaDto, AiScenarioDto } from "@evcp/api-client";
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

function CredentialRow({
  credential,
  onSetStatus,
  onDelete
}: {
  credential: AiApiKeyDto;
  onSetStatus: (keyId: string, status: AiApiKeyDto["status"]) => void;
  onDelete: (keyId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const isActive = credential.status === "active";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <strong className="text-sm font-medium text-body">{credential.name}</strong>
        <span className="text-xs text-muted">
          {credential.providerId} · {credential.maskedValue}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={isActive ? "success" : "warning"}>{credential.status}</Badge>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onSetStatus(credential.id, isActive ? "disabled" : "active")}
        >
          {isActive ? "Disable" : "Enable"}
        </Button>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Confirm delete?</span>
            <Button size="sm" variant="danger" onClick={() => onDelete(credential.id)}>
              Delete
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

type TabId = "providers" | "credentials" | "routing" | "quota" | "test";

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
  const [tab, setTab] = useState<TabId>("providers");

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

      <Tabs
        items={[
          { id: "providers", label: "Providers" },
          { id: "credentials", label: "Credentials" },
          { id: "routing", label: "Routing" },
          { id: "quota", label: "Quota" },
          { id: "test", label: "Test" }
        ]}
        active={tab}
        onSelect={setTab}
        aria-label="AI governance sections"
      />

      {tab === "providers" && (
        <>
          <div className="flex justify-end">
            <Button disabled={disabled} onClick={() => setProviderOpen(true)}>+ Add provider</Button>
          </div>

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
                    onSetStatus={ai.setProviderStatus}
                    onDelete={ai.removeProvider}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {tab === "credentials" && (
        <SectionCard eyebrow="Records" title="Stored credentials">
          {ai.apiKeys.length === 0 ? (
            <p className="text-sm text-muted">No credentials yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ai.apiKeys.map((credential) => (
                <CredentialRow
                  key={credential.id}
                  credential={credential}
                  onSetStatus={ai.setCredentialStatus}
                  onDelete={ai.removeCredential}
                />
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "routing" && (
        <RoutingMatrix routes={ai.routes} providers={ai.providers} disabled={disabled}
          onConfigure={(scenario) => { setRouteScenario(scenario); setRouteOpen(true); }} />
      )}

      {tab === "quota" && (
        <QuotaPanel quotas={ai.quotas} disabled={disabled}
          onEdit={(scope) => { setQuotaScope(scope); setQuotaOpen(true); }} />
      )}

      {tab === "test" && <ProviderTestPanel ai={ai} disabled={disabled} onResult={setLastTest} />}

      <ProviderDrawer open={providerOpen} onClose={() => setProviderOpen(false)} ai={ai} onDone={done} />
      <CredentialDrawer open={credentialOpen} onClose={() => setCredentialOpen(false)} ai={ai} providerId={credentialProvider} onDone={done} />
      <RouteDrawer open={routeOpen} onClose={() => setRouteOpen(false)} ai={ai} scenario={routeScenario} onDone={done} />
      <QuotaDrawer open={quotaOpen} onClose={() => setQuotaOpen(false)} ai={ai} scope={quotaScope} onDone={done} />
    </section>
  );
}
