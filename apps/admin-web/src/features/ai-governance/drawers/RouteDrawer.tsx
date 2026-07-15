import { Button, Drawer, Field, Select } from "@evcp/ui";
import type { AiScenarioDto } from "@evcp/api-client";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { SCENARIOS } from "../lib/derivations";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; scenario?: AiScenarioDto; onDone?: (msg: string) => void };

export function RouteDrawer({ open, onClose, ai, scenario, onDone }: Props) {
  const [selectedScenario, setSelectedScenario] = useState<AiScenarioDto>(scenario ?? "frontend_coding");
  const [primaryProvider, setPrimaryProvider] = useState("");
  const [primaryModel, setPrimaryModel] = useState("");
  const [fallbackProvider, setFallbackProvider] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => { if (open && scenario) setSelectedScenario(scenario); }, [open, scenario]);

  const primary = ai.providers.find((p) => p.id === primaryProvider);
  const fallback = ai.providers.find((p) => p.id === fallbackProvider);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.configureRoute({
        scenario: selectedScenario,
        primaryProviderId: primaryProvider,
        primaryModel,
        ...(fallbackProvider ? { fallbackProviderId: fallbackProvider, ...(fallbackModel ? { fallbackModel } : {}) } : {})
      });
      onDone?.(`${selectedScenario} now routes to the selected provider.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Configure scenario route" description="Choose the governed provider for this generation scenario.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Scenario">
          <Select value={selectedScenario} onChange={(e) => setSelectedScenario(e.target.value as AiScenarioDto)}>
            {SCENARIOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Primary provider">
          <Select value={primaryProvider} onChange={(e) => { setPrimaryProvider(e.target.value); setPrimaryModel(ai.providers.find((p) => p.id === e.target.value)?.models[0] ?? ""); }} required>
            <option value="">Select provider</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Primary model">
          <Select value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} required>
            <option value="">Select model</option>
            {primary?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Fallback provider">
          <Select value={fallbackProvider} onChange={(e) => { setFallbackProvider(e.target.value); setFallbackModel(ai.providers.find((p) => p.id === e.target.value)?.models[0] ?? ""); }}>
            <option value="">No fallback</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Fallback model">
          <Select value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} disabled={!fallbackProvider}>
            <option value="">Use primary model</option>
            {fallback?.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save route</Button>
        </div>
      </form>
    </Drawer>
  );
}
