import { Button, DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { useState } from "react";
import { canMutateAiGovernance, type useAiGovernance } from "@/features/ai-governance";
import { GuardrailRuleDrawer } from "./GuardrailRuleDrawer";

export function GuardrailsConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader eyebrow="AI Governance" title="Guardrails" description="Block unsafe prompts before they reach any provider, and review guardrail decisions." />
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => setOpen(true)}>+ Add rule</Button>
      </div>
      {disabled ? (
        <DecisionPanel tone="warning" badge={ai.availability} title={ai.message}
          lines={["Guardrails are unavailable; connect to Platform API to manage rules. Data is never replaced with demo values."]} />
      ) : null}
      <SectionCard eyebrow="Evidence" title="Recent guardrail events">
        <DataTable
          columns={[{ key: "id", label: "Event" }, { key: "decision", label: "Decision" }, { key: "scenario", label: "Scenario" }, { key: "occurredAt", label: "Time" }]}
          rows={ai.guardrailEvents}
        />
      </SectionCard>
      <GuardrailRuleDrawer open={open} onClose={() => setOpen(false)} ai={ai} />
    </section>
  );
}
