import type { DomainStatusDto } from "@evcp/api-client";

// Pure helpers for the in-UI domain go-live flow (Task 4). Kept framework-free so they are
// unit-testable without rendering; the stateful glue (setDomain + poll-until-live loop) lives
// in use-domain.ts.

export type DomainGoLiveStatus = "idle" | "applying" | "live" | "error";

/** How often to re-poll while a go-live is in flight. */
export const DOMAIN_POLL_INTERVAL_MS = 3000;

// Lowercased hostname: one-or-more `label.` segments followed by a >=2 char TLD label. No
// scheme, port, path, or trailing dot — mirrors the platform-api validation regex
// (apps/platform-api/src/system/domain-service.ts) so the UI rejects the same inputs upfront.
const DOMAIN_RE = /^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/;

/** True when `value` is a bare hostname the platform-api go-live endpoint will accept. */
export function isValidDomain(value: string): boolean {
  const domain = value.trim().toLowerCase();
  return DOMAIN_RE.test(domain);
}

export type PublicUrls = {
  appUrl: string;
  storageUrl: string;
};

/** Derives the public app and storage URLs a given domain will serve, for display only. */
export function derivePublicUrls(domain: string): PublicUrls {
  const host = domain.trim().toLowerCase();
  return {
    appUrl: `https://${host}`,
    storageUrl: `https://storage.${host}`
  };
}

/** Human-readable status line shown above the go-live control. */
export function describeDomainStatus(
  status: DomainGoLiveStatus,
  targetDomain: string | undefined,
  pollNote: string | undefined
): string {
  if (status === "applying") {
    return pollNote ?? `Applying ${targetDomain}. Waiting for https://${targetDomain} to answer…`;
  }
  if (status === "live") return `Live at https://${targetDomain}.`;
  if (status === "error") return pollNote ?? "The domain change could not be started.";
  return "Idle.";
}

/** True once the persisted domain status reflects the target domain we just requested. */
export function isDomainAtTarget(status: DomainStatusDto | undefined, targetDomain: string): boolean {
  if (!status) return false;
  return status.domain === targetDomain;
}
