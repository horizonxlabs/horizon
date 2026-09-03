import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import type { AiProviderDto } from "@evcp/api-client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { ModelCatalogPicker } from "./ModelCatalogPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  ai: ReturnType<typeof useAiGovernance>;
  onDone?: (msg: string) => void;
  editProvider?: AiProviderDto;
};

type AdapterKind = "openai" | "openrouter" | "lm_studio" | "anthropic" | "google";

const PRESETS: Record<AdapterKind, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://gateway.example/v1", model: "gpt-4.1" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  lm_studio: { baseUrl: "http://host.docker.internal:1234/v1", model: "local-model-id" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  // Image-generation provider (scenario "image_generation"): governed image runtime only —
  // text scenarios still reject google at resolve time.
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash-image" }
};

export function ProviderDrawer({ open, onClose, ai, onDone, editProvider }: Props) {
  const isEdit = Boolean(editProvider);
  const [name, setName] = useState(editProvider?.name ?? "");
  const [adapter, setAdapter] = useState<AdapterKind>((editProvider?.adapter as AdapterKind) ?? "openai");
  const [baseUrl, setBaseUrl] = useState(editProvider?.baseUrl ?? "");
  const [models, setModels] = useState(editProvider?.models.join(", ") ?? "");
  const [selectedModels, setSelectedModels] = useState<string[]>(editProvider ? [...editProvider.models] : []);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const preset = PRESETS[adapter];
  const usePicker = adapter === "openrouter" && !catalogUnavailable;
  // Stable identity so ModelCatalogPicker's effect doesn't re-run (and re-fetch)
  // when unrelated drawer state (name, error, …) triggers a parent re-render.
  const handleCatalogUnavailable = useCallback(() => setCatalogUnavailable(true), []);

  // Repopulate the form whenever the drawer is switched to edit a different
  // provider (or back to create mode).
  useEffect(() => {
    if (editProvider) {
      setName(editProvider.name);
      setAdapter(editProvider.adapter as AdapterKind);
      setBaseUrl(editProvider.baseUrl ?? "");
      setModels(editProvider.models.join(", "));
      setSelectedModels([...editProvider.models]);
    } else {
      setName("");
      setAdapter("openai");
      setBaseUrl("");
      setModels("");
      setSelectedModels([]);
    }
    setCatalogUnavailable(false);
    setError(undefined);
  }, [editProvider?.id]);

  function selectAdapter(next: AdapterKind) {
    if (isEdit) return;
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
      if (editProvider) {
        const provider = await ai.updateProvider(editProvider.id, {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          models: modelList
        });
        onDone?.(`Provider ${provider.name} updated.`);
      } else {
        const provider = await ai.createProvider({
          name: name.trim(),
          adapter,
          baseUrl: baseUrl.trim(),
          models: modelList
        });
        onDone?.(`Provider ${provider.name} saved.`);
      }
      setName(""); setBaseUrl(""); setModels(""); setSelectedModels([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider could not be saved.");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit provider" : "Add provider"}
      description={isEdit ? "Update the name, base URL, or models for this endpoint." : "Register an approved AI endpoint."}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Adapter">
          <Select value={adapter} onChange={(e) => selectAdapter(e.target.value as AdapterKind)} disabled={isEdit}>
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
              onUnavailable={handleCatalogUnavailable}
            />
          </Field>
        ) : (
          <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
            <Input value={models} onChange={(e) => setModels(e.target.value)}
              placeholder={preset.model} required />
          </Field>
        )}
        {adapter === "lm_studio" && !isEdit && (
          <p className="text-xs text-muted">
            LM Studio ignores the API key — add any non-empty value (e.g. lm-studio) in the credential step.
          </p>
        )}
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{isEdit ? "Save changes" : "Save provider"}</Button>
        </div>
      </form>
    </Drawer>
  );
}
