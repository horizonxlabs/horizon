import type { SwarmServiceEngine } from "../workspace-orchestrator/swarm-service-engine";

// Lowercased hostname: one-or-more `label.` segments followed by a >=2 char TLD label. No
// scheme, port, path, or trailing dot — matches the spec's go-live precondition regex.
const DOMAIN_RE = /^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/;

export class InvalidDomain extends Error {}

export type DomainStatus = {
  domain: string | null;
  publicBaseUrl: string;
  caddyAddress: string;
};

export type DomainSettings = {
  getBusinessSettings(): Promise<{ domain?: string | null } | null>;
  setDomain(domain: string): Promise<unknown>;
};

// Structural subset of KeycloakAdminClient (get/put) so tests can stub it without constructing
// a real client; `null | undefined` means "not configured" (reconcile is skipped, not fatal).
export type DomainKeycloakClient = {
  get<T>(path: string): Promise<{ data: T }>;
  put<T>(path: string, body?: unknown): Promise<{ data: T }>;
};

export type WriteDomainEnvFn = (path: string, content: string) => void;

/**
 * Admin "go live" service (B2, spec Component 2): validates a domain, persists it as the
 * source of truth in business settings, writes a durable `domain.env` override the bootstrap
 * script re-sources on every deploy, reconciles the Keycloak OIDC client's redirect URI, and
 * rolls caddy/keycloak/platform-api to the new public URLs via `SwarmServiceEngine.updateServiceEnv`
 * (platform-api last, fire-and-forget — restarting it would otherwise block the response).
 */
export function createDomainService(deps: {
  engine: SwarmServiceEngine;
  settings: DomainSettings;
  keycloak?: DomainKeycloakClient;
  writeDomainEnv: WriteDomainEnvFn;
  env?: NodeJS.ProcessEnv;
}) {
  const env = deps.env ?? process.env;
  const realm = env.KEYCLOAK_REALM ?? "evcp";
  const platformClientId = env.KEYCLOAK_PLATFORM_CLIENT_ID ?? "evcp-platform-api";
  const stackEnvDir = env.EVCP_STACK_ENV_DIR ?? "/opt/evcp";

  return {
    async getDomainStatus(): Promise<DomainStatus> {
      const record = await deps.settings.getBusinessSettings();
      return {
        domain: record?.domain ?? null,
        publicBaseUrl: env.EVCP_PUBLIC_API_URL ?? "",
        caddyAddress: env.EVCP_CADDY_ADDRESS ?? ""
      };
    },

    async setDomain(rawDomain: string): Promise<{ accepted: true; domain: string }> {
      const domain = String(rawDomain ?? "")
        .trim()
        .toLowerCase();
      if (!DOMAIN_RE.test(domain)) throw new InvalidDomain(`invalid domain: ${rawDomain}`);

      const base = `https://${domain}`;
      const storageHost = `storage.${domain}`;
      const publicUrls = {
        EVCP_PUBLIC_API_URL: `${base}/api`,
        EVCP_ADMIN_WEB_URL: base,
        EVCP_CREATOR_WEB_URL: base,
        EVCP_STORE_WEB_URL: base,
        EVCP_S3_PUBLIC_URL: `https://${storageHost}`,
        KEYCLOAK_PUBLIC_URL: `${base}/auth`,
        KEYCLOAK_ISSUER_URL: `${base}/auth/realms/${realm}`
      };

      // 1. Postgres is the source of truth for the UI/app.
      await deps.settings.setDomain(domain);

      // 2. Durable override the bootstrap re-sources on every future deploy (no secrets — only
      // the domain-carrying public URL vars, mirroring bootstrap-swarm.sh's build_stack_env).
      const domainEnvContent =
        [
          `EVCP_CADDY_ADDRESS=${domain}`,
          `EVCP_STORAGE_CADDY_ADDRESS=${storageHost}`,
          ...Object.entries(publicUrls).map(([key, value]) => `${key}=${value}`)
        ].join("\n") + "\n";
      deps.writeDomainEnv(`${stackEnvDir}/domain.env`, domainEnvContent);

      // 3. Reconcile the Keycloak client's redirect URI/web origin. Optional: a missing admin
      // client means Keycloak auth isn't configured at all, so skip (warn) rather than fail.
      if (deps.keycloak) {
        try {
          const found = await deps.keycloak.get<Array<{ id: string }>>(
            `/clients?clientId=${encodeURIComponent(platformClientId)}`
          );
          const client = found.data?.[0];
          if (client?.id) {
            // Partial ClientRepresentation: Keycloak leaves unspecified fields untouched on a
            // client update, and redirectUris is intentionally REPLACED to drop the IP-based callback.
            await deps.keycloak.put(`/clients/${client.id}`, {
              redirectUris: [`${publicUrls.EVCP_PUBLIC_API_URL}/auth/keycloak/callback`],
              webOrigins: [base]
            });
          } else {
            console.warn(`[domain-service] no Keycloak client found for clientId=${platformClientId}; skipping redirect reconcile`);
          }
        } catch (error) {
          // Per spec: the env roll still applies; the admin can retry the reconcile.
          console.warn("[domain-service] Keycloak redirect reconcile failed:", error);
        }
      } else {
        console.warn("[domain-service] no KeycloakAdminClient configured; skipping redirect reconcile");
      }

      // 4. Roll the running services: caddy + keycloak first (awaited), platform-api last and
      // fire-and-forget (rolling it restarts the very process serving this request).
      await deps.engine.updateServiceEnv("evcp_caddy", {
        EVCP_CADDY_ADDRESS: domain,
        EVCP_STORAGE_CADDY_ADDRESS: storageHost
      });
      await deps.engine.updateServiceEnv("evcp_keycloak", { KC_HOSTNAME: publicUrls.KEYCLOAK_PUBLIC_URL });
      void deps.engine
        .updateServiceEnv("evcp_platform-api", publicUrls)
        .catch((error) => console.warn("[domain-service] platform-api self-roll failed:", error));

      return { accepted: true, domain };
    }
  };
}

export type DomainService = ReturnType<typeof createDomainService>;
