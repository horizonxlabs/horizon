import { Badge, Button } from "@evcp/ui";
import type { AiApiKeyDto, AiProviderDto, AiScenarioDto } from "@evcp/api-client";

export function ProviderCard({
  provider,
  credentials,
  routedScenarios,
  onAddCredential
}: {
  provider: AiProviderDto;
  credentials: AiApiKeyDto[];
  routedScenarios: AiScenarioDto[];
  onAddCredential: (providerId: string) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <strong className="text-sm font-semibold text-body">{provider.name}</strong>
          <span className="truncate text-xs text-muted">{provider.baseUrl}</span>
        </div>
        <Badge>{provider.adapter}</Badge>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {provider.models.map((model) => (
          <span key={model} className="rounded-control bg-surface-muted px-2 py-0.5 text-xs text-body">
            {model}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">
        {credentials.length
          ? `🔑 ${credentials.length} credential${credentials.length > 1 ? "s" : ""} · ${credentials[0].maskedValue}`
          : "No credential — add one to activate this provider."}
      </p>
      <p className="text-xs text-muted">
        {routedScenarios.length ? `Routed: ${routedScenarios.join(", ")}` : "Not routed to any scenario."}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => onAddCredential(provider.id)}>
          Add credential
        </Button>
      </div>
    </article>
  );
}
