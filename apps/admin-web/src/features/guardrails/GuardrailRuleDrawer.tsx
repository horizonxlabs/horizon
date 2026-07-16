import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "@/features/ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

export function GuardrailRuleDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "high" | "critical">("high");
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.createGuardrailRule({ name: name.trim(), type: "keyword", pattern: pattern.trim(), severity, action: "block", scope: "organization" });
      onDone?.(`Guardrail active: ${name.trim()}`);
      setName(""); setPattern("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Guardrail could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add blocking rule" description="Matching prompts are rejected before any provider call.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Rule name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Blocked keyword"><Input value={pattern} onChange={(e) => setPattern(e.target.value)} required /></Field>
        <Field label="Severity">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="info">info</option><option value="warning">warning</option>
            <option value="high">high</option><option value="critical">critical</option>
          </Select>
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save rule</Button>
        </div>
      </form>
    </Drawer>
  );
}
