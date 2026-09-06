import { Badge, Button } from "@evcp/ui";
import type { AiApiKeyDto, AiProviderDto, AiScenarioDto } from "@evcp/api-client";
import { useState } from "react";

export function ProviderCard({
  provider,
  credentials,
  routedScenarios,
  onAddCredential,
  onSetStatus,
  onEdit,
  onDelete
}: {
  provider: AiProviderDto;
  credentials: AiApiKeyDto[];
  routedScenarios: AiScenarioDto[];
  onAddCredential: (providerId: string) => void;
  onSetStatus: (providerId: string, status: AiProviderDto["status"]) => void;
  onEdit: (provider: AiProviderDto) => void;
  onDelete: (providerId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const isActive = provider.status === "active";
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <header className="flex items-start justify-between gap-2">
        {/* min-w-0 lets this column actually shrink (flex min-width:auto otherwise keeps the
            long baseUrl at intrinsic width and pushes the badges outside the card). */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="text-sm font-semibold text-body">{provider.name}</strong>
          <span className="truncate text-xs text-muted" title={provider.baseUrl}>
            {provider.baseUrl}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge>{provider.adapter}</Badge>
          <Badge tone={isActive ? "success" : "warning"}>{provider.status}</Badge>
        </div>
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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onAddCredential(provider.id)}>
          Add credential
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onSetStatus(provider.id, isActive ? "disabled" : "active")}
        >
          {isActive ? "Disable" : "Enable"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onEdit(provider)}>
          Edit
        </Button>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Confirm delete?</span>
            <Button size="sm" variant="danger" onClick={() => onDelete(provider.id)}>
              Delete
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
    </article>
  );
}
