import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

export function ProviderDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState<"openai" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const provider = await ai.createProvider({
        name: name.trim(), adapter, baseUrl: baseUrl.trim(),
        models: models.split(",").map((m) => m.trim()).filter(Boolean)
      });
      onDone?.(`Provider ${provider.name} saved.`);
      setName(""); setBaseUrl(""); setModels("");
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
          <Select value={adapter} onChange={(e) => setAdapter(e.target.value as typeof adapter)}>
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic native</option>
          </Select>
        </Field>
        <Field label="Provider base URL">
          <Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={adapter === "anthropic" ? "https://api.anthropic.com/v1" : "https://gateway.example/v1"} required />
        </Field>
        <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
          <Input value={models} onChange={(e) => setModels(e.target.value)}
            placeholder={adapter === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1"} required />
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save provider</Button>
        </div>
      </form>
    </Drawer>
  );
}
