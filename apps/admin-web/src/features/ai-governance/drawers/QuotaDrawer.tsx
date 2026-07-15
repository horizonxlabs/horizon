import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import type { AiQuotaDto } from "@evcp/api-client";
import { useEffect, useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { QUOTA_SCOPES } from "../lib/derivations";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; scope?: AiQuotaDto["scope"]; onDone?: (msg: string) => void };

export function QuotaDrawer({ open, onClose, ai, scope, onDone }: Props) {
  const [selectedScope, setSelectedScope] = useState<AiQuotaDto["scope"]>(scope ?? "organization");
  const [daily, setDaily] = useState("100000");
  const [monthly, setMonthly] = useState("2000000");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const target = scope ?? "organization";
    setSelectedScope(target);
    const existing = ai.quotas.find((q) => q.scope === target);
    if (existing) { setDaily(String(existing.dailyLimit)); setMonthly(String(existing.monthlyLimit)); }
  }, [open, scope, ai.quotas]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await ai.configureQuota({
        scope: selectedScope, dailyLimit: Number(daily), monthlyLimit: Number(monthly),
        warningThreshold: Math.floor(Number(daily) * 0.8), hardStop: true, usedToday: 0
      });
      onDone?.(`${selectedScope} quota saved with a hard stop.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quota could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Edit quota" description="Hard-stop budgets block requests once the daily limit is reached.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Scope">
          <Select value={selectedScope} onChange={(e) => setSelectedScope(e.target.value as AiQuotaDto["scope"])}>
            {QUOTA_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Daily tokens"><Input type="number" min="1" value={daily} onChange={(e) => setDaily(e.target.value)} required /></Field>
        <Field label="Monthly tokens"><Input type="number" min="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} required /></Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save quota</Button>
        </div>
      </form>
    </Drawer>
  );
}
