import { DataTable, DecisionPanel, SectionCard } from "@evcp/ui";
import type { AiProviderAdapterDto } from "@evcp/api-client";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "./use-ai-governance";
import { canMutateAiGovernance } from "./status";

const scenarios = ["prd_generation", "requirement_analysis", "frontend_coding", "backend_coding", "review", "documentation"] as const;
const quotaScopes = ["organization", "creator", "project", "app"] as const;

export function AiGovernancePanel({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [providerName, setProviderName] = useState("");
  const [providerAdapter, setProviderAdapter] = useState<Extract<AiProviderAdapterDto, "openai" | "anthropic">>("openai");
  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [providerModels, setProviderModels] = useState("");
  const [keyProviderId, setKeyProviderId] = useState("");
  const [keyName, setKeyName] = useState("production");
  const [keySecret, setKeySecret] = useState("");
  const [scenario, setScenario] = useState<(typeof scenarios)[number]>("frontend_coding");
  const [routeProviderId, setRouteProviderId] = useState("");
  const [routeModel, setRouteModel] = useState("");
  const [fallbackProviderId, setFallbackProviderId] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [quotaScope, setQuotaScope] = useState<(typeof quotaScopes)[number]>("organization");
  const [dailyLimit, setDailyLimit] = useState("100000");
  const [monthlyLimit, setMonthlyLimit] = useState("2000000");
  const [guardrailName, setGuardrailName] = useState("");
  const [guardrailPattern, setGuardrailPattern] = useState("");
  const [message, setMessage] = useState<string>();
  const [testPrompt, setTestPrompt] = useState("Return one short readiness sentence.");
  const [testResult, setTestResult] = useState<string>();

  const selectedRouteProvider = ai.providers.find((provider) => provider.id === routeProviderId);
  const selectedFallbackProvider = ai.providers.find((provider) => provider.id === fallbackProviderId);

  async function submitProvider(event: FormEvent) {
    event.preventDefault();
    try {
      const provider = await ai.createProvider({
        name: providerName.trim(), adapter: providerAdapter, baseUrl: providerBaseUrl.trim(),
        models: providerModels.split(",").map((model) => model.trim()).filter(Boolean)
      });
      setKeyProviderId(provider.id);
      setRouteProviderId(provider.id);
      setRouteModel(provider.models[0] ?? "");
      setProviderName(""); setProviderBaseUrl(""); setProviderModels("");
      setMessage(`Provider ${provider.name} saved. Add its credential below.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provider could not be saved."); }
  }

  async function submitKey(event: FormEvent) {
    event.preventDefault();
    try {
      const key = await ai.saveApiKey({ providerId: keyProviderId, name: keyName.trim(), usageMode: "production", quotaTokens: Number(dailyLimit), fallbackPriority: 0 }, keySecret);
      setKeySecret("");
      setMessage(`Credential saved as ${key.maskedValue}. The plaintext key was discarded from this form.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Credential could not be saved."); }
  }

  async function submitRoute(event: FormEvent) {
    event.preventDefault();
    try {
      await ai.configureRoute({
        scenario,
        primaryProviderId: routeProviderId,
        primaryModel: routeModel,
        ...(fallbackProviderId ? {
          fallbackProviderId,
          ...(fallbackModel ? { fallbackModel } : {})
        } : {})
      });
      setMessage(`${scenario} now uses the selected governed provider route.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Route could not be saved."); }
  }

  async function submitQuota(event: FormEvent) {
    event.preventDefault();
    try {
      await ai.configureQuota({ scope: quotaScope, dailyLimit: Number(dailyLimit), monthlyLimit: Number(monthlyLimit), warningThreshold: Math.floor(Number(dailyLimit) * 0.8), hardStop: true, usedToday: 0 });
      setMessage(`${quotaScope} quota saved with a hard stop.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Quota could not be saved."); }
  }

  async function submitGuardrail(event: FormEvent) {
    event.preventDefault();
    try {
      await ai.createGuardrailRule({ name: guardrailName.trim(), type: "keyword", pattern: guardrailPattern.trim(), severity: "high", action: "block", scope: "organization" });
      setGuardrailName(""); setGuardrailPattern("");
      setMessage("Blocking guardrail saved. Matching prompts are rejected before any provider call.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Guardrail could not be saved."); }
  }

  async function runTestCall() {
    try {
      const result = await ai.testProvider({ scenario, prompt: testPrompt });
      setTestResult(`${result.status} · ${result.providerName} · ${result.model} · ${result.tokensUsed} tokens · ${result.latencyMs} ms`);
    } catch (error) { setTestResult(error instanceof Error ? error.message : "Provider test failed."); }
  }

  return <section className="admin-page-stack">
    <DecisionPanel tone={disabled ? "warning" : "success"} badge={ai.availability} title={message ?? ai.message} lines={["Provider secrets are sent only to Platform API and stored by the configured OpenBao-compatible secret store."]} />
    <section className="ds-grid-2">
      <SectionCard eyebrow="1. Provider" title="Register approved endpoint">
        <form className="admin-page-stack" onSubmit={(event) => void submitProvider(event)}>
          <label>Name<input value={providerName} onChange={(event) => setProviderName(event.target.value)} required disabled={disabled} /></label>
          <label>Adapter<select value={providerAdapter} onChange={(event) => setProviderAdapter(event.target.value as typeof providerAdapter)} disabled={disabled}><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic native</option></select></label>
          <label>Provider base URL<input type="url" value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} placeholder={providerAdapter === "anthropic" ? "https://api.anthropic.com/v1" : "https://gateway.example/v1"} required disabled={disabled} /></label>
          <label>Models (comma-separated)<input value={providerModels} onChange={(event) => setProviderModels(event.target.value)} placeholder={providerAdapter === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1"} required disabled={disabled} /></label>
          <button type="submit" disabled={disabled}>Save provider</button>
        </form>
      </SectionCard>
      <SectionCard eyebrow="2. Credential" title="Store provider credential">
        <form className="admin-page-stack" onSubmit={(event) => void submitKey(event)}>
          <label>Provider<select value={keyProviderId} onChange={(event) => setKeyProviderId(event.target.value)} required disabled={disabled}><option value="">Select provider</option>{ai.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label>Credential name<input value={keyName} onChange={(event) => setKeyName(event.target.value)} required disabled={disabled} /></label>
          <label>Provider credential<input type="password" autoComplete="new-password" value={keySecret} onChange={(event) => setKeySecret(event.target.value)} required disabled={disabled} /></label>
          <button type="submit" disabled={disabled}>Store credential</button>
        </form>
      </SectionCard>
      <SectionCard eyebrow="3. Route" title="Governed scenario route">
        <form className="admin-page-stack" onSubmit={(event) => void submitRoute(event)}>
          <label>Scenario<select value={scenario} onChange={(event) => setScenario(event.target.value as typeof scenario)} disabled={disabled}>{scenarios.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Provider<select value={routeProviderId} onChange={(event) => { const provider = ai.providers.find((item) => item.id === event.target.value); setRouteProviderId(event.target.value); setRouteModel(provider?.models[0] ?? ""); }} required disabled={disabled}><option value="">Select provider</option>{ai.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label>Model<select value={routeModel} onChange={(event) => setRouteModel(event.target.value)} required disabled={disabled}><option value="">Select model</option>{selectedRouteProvider?.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
          <label>Fallback provider<select value={fallbackProviderId} onChange={(event) => { const provider = ai.providers.find((item) => item.id === event.target.value); setFallbackProviderId(event.target.value); setFallbackModel(provider?.models[0] ?? ""); }} disabled={disabled}><option value="">No fallback</option>{ai.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label>Fallback model<select value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)} disabled={disabled || !fallbackProviderId}><option value="">Use primary model</option>{selectedFallbackProvider?.models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
          <button type="submit" disabled={disabled}>Save route</button>
        </form>
      </SectionCard>
      <SectionCard eyebrow="4. Quota" title="Hard-stop budget">
        <form className="admin-page-stack" onSubmit={(event) => void submitQuota(event)}>
          <label>Scope<select value={quotaScope} onChange={(event) => setQuotaScope(event.target.value as typeof quotaScope)} disabled={disabled}>{quotaScopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Daily tokens<input type="number" min="1" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} required disabled={disabled} /></label>
          <label>Monthly tokens<input type="number" min="1" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} required disabled={disabled} /></label>
          <button type="submit" disabled={disabled}>Save hard-stop quota</button>
        </form>
      </SectionCard>
      <SectionCard eyebrow="5. Guardrail" title="Block unsafe prompts">
        <form className="admin-page-stack" onSubmit={(event) => void submitGuardrail(event)}>
          <label>Rule name<input value={guardrailName} onChange={(event) => setGuardrailName(event.target.value)} required disabled={disabled} /></label>
          <label>Blocked keyword<input value={guardrailPattern} onChange={(event) => setGuardrailPattern(event.target.value)} required disabled={disabled} /></label>
          <button type="submit" disabled={disabled}>Save blocking guardrail</button>
        </form>
      </SectionCard>
    </section>
    <SectionCard eyebrow="6. Verify" title="Live governed provider test">
      <label>Prompt<input value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)} disabled={disabled} /></label>
      <p>{testResult ?? "The test records provider, model, status, latency, tokens, cost and audit evidence; it never returns the credential."}</p>
      <button type="button" onClick={() => void runTestCall()} disabled={disabled || !testPrompt.trim()}>Run test call</button>
    </SectionCard>
    <SectionCard eyebrow="Persisted records" title="Providers, masked credentials, and guardrail evidence"><DataTable columns={[{ key: "name", label: "Provider" }, { key: "adapter", label: "Adapter" }, { key: "status", label: "Status" }]} rows={ai.providers} /><DataTable columns={[{ key: "name", label: "Credential" }, { key: "providerId", label: "Provider" }, { key: "maskedValue", label: "Masked value" }, { key: "status", label: "Status" }]} rows={ai.apiKeys} /><DataTable columns={[{ key: "id", label: "Event" }, { key: "decision", label: "Decision" }, { key: "scenario", label: "Scenario" }, { key: "occurredAt", label: "Time" }]} rows={ai.guardrailEvents} /></SectionCard>
  </section>;
}
