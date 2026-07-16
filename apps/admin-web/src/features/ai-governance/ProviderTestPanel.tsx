import { Button, Field, Input, SectionCard, Select } from "@evcp/ui";
import type { AiScenarioDto } from "@evcp/api-client";
import { useState } from "react";
import type { useAiGovernance } from "./use-ai-governance";
import { SCENARIOS } from "./lib/derivations";

export function ProviderTestPanel({
  ai,
  disabled,
  onResult
}: {
  ai: ReturnType<typeof useAiGovernance>;
  disabled: boolean;
  onResult?: (summary: string) => void;
}) {
  const [scenario, setScenario] = useState<AiScenarioDto>("frontend_coding");
  const [prompt, setPrompt] = useState("Return one short readiness sentence.");
  const [result, setResult] = useState<string>();

  async function run() {
    try {
      const r = await ai.testProvider({ scenario, prompt });
      const summary = `${r.status} · ${r.providerName} · ${r.model} · ${r.tokensUsed} tokens · ${r.latencyMs} ms`;
      setResult(summary);
      onResult?.(summary);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Provider test failed.");
    }
  }

  return (
    <SectionCard eyebrow="Verify" title="Live governed test">
      <div className="flex flex-col gap-4">
        <Field label="Scenario">
          <Select
            value={scenario}
            onChange={(event) => setScenario(event.target.value as AiScenarioDto)}
            disabled={disabled}
          >
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prompt">
          <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={disabled} />
        </Field>
        <p className="text-sm text-muted">
          {result ?? "Records provider, model, status, latency, tokens and audit evidence; never returns the credential."}
        </p>
        <div>
          <Button onClick={() => void run()} disabled={disabled || !prompt.trim()}>
            Run test call
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
