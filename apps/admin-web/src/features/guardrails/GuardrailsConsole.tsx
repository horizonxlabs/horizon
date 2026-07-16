import { Button, DataTable, DecisionPanel, PageHeader, SectionCard } from "@evcp/ui";
import { useState } from "react";
import { canMutateAiGovernance, type useAiGovernance } from "@/features/ai-governance";
import { GuardrailRuleDrawer } from "./GuardrailRuleDrawer";

export function GuardrailsConsole({ ai }: { ai: ReturnType<typeof useAiGovernance> }) {
  const disabled = !canMutateAiGovernance(ai.availability);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader eyebrow="AI Governance" title="Guardrails" description="Block unsafe prompts before they reach any provider, and review guardrail decisions." />
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => setOpen(true)}>+ Add rule</Button>
      </div>
      <DecisionPanel tone={disabled ? "warning" : "success"} badge={ai.availability} title={message ?? ai.message}
        lines={["Guardrail rules are evaluated on every governed provider call."]} />
      <SectionCard eyebrow="Evidence" title="Recent guardrail events">
        <DataTable
          columns={[{ key: "id", label: "Event" }, { key: "decision", label: "Decision" }, { key: "scenario", label: "Scenario" }, { key: "occurredAt", label: "Time" }]}
          rows={ai.guardrailEvents}
        />
      </SectionCard>
      <GuardrailRuleDrawer open={open} onClose={() => setOpen(false)} ai={ai} onDone={setMessage} />
    </section>
  );
}
