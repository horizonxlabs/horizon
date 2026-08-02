import type { PlatformApiClient } from "@evcp/api-client";
import { Badge, Button, DecisionPanel, Drawer, Field, Input, PageHeader, SectionCard } from "@evcp/ui";
import { useState } from "react";
import { describeDomainStatus, derivePublicUrls, isValidDomain } from "./lib/domain";
import { useDomain } from "./use-domain";

/** Admin-only "Domain" page: current domain/public URLs, a domain input, and a "Go live"
 * control that sets the domain (reconfigure + TLS) and polls until the site answers. Owns the
 * `useDomain` hook (mirrors SystemUpdatePanel / useSystemUpdate) — all business logic lives in
 * the hook and lib, this component only renders from it. */
export function DomainPanel({ client }: { client: PlatformApiClient }) {
  const domain = useDomain(client);
  const [domainInput, setDomainInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = domain.goLiveStatus === "applying";
  const trimmed = domainInput.trim().toLowerCase();
  const publicUrls = trimmed ? derivePublicUrls(trimmed) : undefined;

  function confirmGoLive() {
    setConfirmOpen(false);
    void domain.goLive(trimmed);
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Domain"
        title="Public domain"
        description="View the domain currently serving this platform and go live with a new one."
      />

      {domain.loadError ? (
        <DecisionPanel
          tone="danger"
          badge="unavailable"
          title={domain.loadError}
          lines={["Domain status is loaded from Platform API; unavailable data is never shown as a fallback success."]}
        />
      ) : null}

      {domain.goLiveStatus !== "idle" ? (
        <DecisionPanel
          tone={domain.goLiveStatus === "live" ? "success" : domain.goLiveStatus === "error" ? "danger" : "warning"}
          badge={domain.goLiveStatus}
          title={describeDomainStatus(domain.goLiveStatus, domain.targetDomain, domain.pollNote)}
          lines={
            domain.goLiveStatus === "applying"
              ? ["Caddy and Platform API restart as part of the roll-out; polling keeps retrying through that."]
              : []
          }
        />
      ) : null}

      <SectionCard eyebrow="Current" title="Public domain" actions={<Badge tone="info">{domain.status?.domain || "not set"}</Badge>}>
        <p className="text-sm text-muted">Public base URL: {domain.status?.publicBaseUrl || "unknown"}</p>
        <p className="text-sm text-muted">Caddy address: {domain.status?.caddyAddress || "unknown"}</p>
      </SectionCard>

      <SectionCard eyebrow="Go live" title="Set the public domain">
        <div className="flex flex-col gap-4">
          <Field
            label="Domain"
            htmlFor="domain-go-live-input"
            hint="A bare hostname such as app.example.com; storage.<domain> is derived automatically."
          >
            <Input
              id="domain-go-live-input"
              placeholder="app.example.com"
              value={domainInput}
              disabled={busy}
              onChange={(event) => setDomainInput(event.target.value)}
            />
          </Field>
          {publicUrls ? (
            <p className="text-sm text-muted">
              App: {publicUrls.appUrl} · Storage: {publicUrls.storageUrl}
            </p>
          ) : null}
          <div>
            <Button disabled={busy || !isValidDomain(domainInput)} onClick={() => setConfirmOpen(true)}>
              {busy ? "Going live…" : "Go live"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <Drawer
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Go live with ${trimmed}?`}
        description="Reconfigures Caddy, Keycloak, and Platform API for the new domain, then requests a TLS certificate."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmGoLive}>Confirm go live</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          Point <strong className="text-body">{trimmed}</strong> and <strong className="text-body">storage.{trimmed}</strong> DNS
          at this server first — TLS issuance will fail and the console will keep polling until it succeeds if DNS is not
          already pointed here.
        </p>
      </Drawer>
    </section>
  );
}
