import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; providerId?: string; onDone?: (msg: string) => void };

export function CredentialDrawer({ open, onClose, ai, providerId, onDone }: Props) {
  const [selectedProvider, setSelectedProvider] = useState(providerId ?? "");
  const [name, setName] = useState("production");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => { if (open) setSelectedProvider(providerId ?? ""); }, [open, providerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const key = await ai.saveApiKey(
        { providerId: selectedProvider, name: name.trim(), usageMode: "production", quotaTokens: 0, fallbackPriority: 0 },
        secret
      );
      onDone?.(`Credential saved as ${key.maskedValue}.`);
      setSecret("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Credential could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add credential" description="Stored via the OpenBao-compatible secret store; the plaintext key never leaves this form.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Provider">
          <Select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} required>
            <option value="">Select provider</option>
            {ai.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Credential name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Provider credential">
          <Input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Store credential</Button>
        </div>
      </form>
    </Drawer>
  );
}
