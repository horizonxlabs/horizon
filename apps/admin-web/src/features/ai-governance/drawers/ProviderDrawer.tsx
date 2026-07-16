import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { ModelCatalogPicker } from "./ModelCatalogPicker";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

type AdapterKind = "openai" | "openrouter" | "lm_studio" | "anthropic";

const PRESETS: Record<AdapterKind, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://gateway.example/v1", model: "gpt-4.1" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  lm_studio: { baseUrl: "http://host.docker.internal:1234/v1", model: "local-model-id" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" }
};

export function ProviderDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState<AdapterKind>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const preset = PRESETS[adapter];
  const usePicker = adapter === "openrouter" && !catalogUnavailable;

  function selectAdapter(next: AdapterKind) {
    setAdapter(next);
    setBaseUrl(PRESETS[next].baseUrl);
    setSelectedModels([]);
    setCatalogUnavailable(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const modelList = usePicker
      ? selectedModels
      : models.split(",").map((m) => m.trim()).filter(Boolean);
    if (modelList.length === 0) {
      setError("Select at least one model.");
      return;
    }
    try {
      const provider = await ai.createProvider({
        name: name.trim(),
        adapter,
        baseUrl: baseUrl.trim(),
        models: modelList
      });
      onDone?.(`Provider ${provider.name} saved.`);
      setName(""); setBaseUrl(""); setModels(""); setSelectedModels([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add provider" description="Register an approved AI endpoint.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Adapter">
          <Select value={adapter} onChange={(e) => selectAdapter(e.target.value as AdapterKind)}>
            <option value="openai">OpenAI-compatible</option>
            <option value="openrouter">OpenRouter</option>
            <option value="lm_studio">LM Studio (local)</option>
            <option value="anthropic">Anthropic native</option>
          </Select>
        </Field>
        <Field label="Provider base URL">
          <Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={preset.baseUrl} required />
        </Field>
        {usePicker ? (
          <Field label="Models">
            <ModelCatalogPicker
              baseUrl={baseUrl}
              value={selectedModels}
              onChange={setSelectedModels}
              loadCatalog={ai.loadModelCatalog}
              onUnavailable={() => setCatalogUnavailable(true)}
            />
          </Field>
        ) : (
          <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
            <Input value={models} onChange={(e) => setModels(e.target.value)}
              placeholder={preset.model} required />
          </Field>
        )}
        {adapter === "lm_studio" && (
          <p className="text-xs text-muted">
            LM Studio ignores the API key — add any non-empty value (e.g. lm-studio) in the credential step.
          </p>
        )}
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save provider</Button>
        </div>
      </form>
    </Drawer>
  );
}
