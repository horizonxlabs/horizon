# In-UI Domain + TLS "Go Live" (B2) — Design

**Status:** Draft for review.
**Date:** 2026-08-02
**Scope:** Final sub-project of the "easy setup" program. From the Admin Console an admin sets a real domain; the platform reconfigures Caddy (auto-TLS), Keycloak (hostname + client redirect URIs), and platform-api's public URLs to `https://<domain>`, durably (survives redeploy/reboot/update). Reuses the `SwarmServiceEngine` from B-sys.

## Goal

The IP-first bootstrap gets you to the Admin Console over `http://<ip>`. B2 turns that into a proper `https://<domain>` deployment from the UI: type a domain, click **Go live**, and Caddy provisions a Let's Encrypt cert while Keycloak/platform-api switch to the domain — with the change persisting across future `docker stack deploy` / `install.sh update` runs.

## Background

- Public URLs flow from `stack.env` (manager file, regenerated IP-first on every `bootstrap-swarm.sh` run) → compose `${VAR}` interpolation → service env. The domain-carrying vars: caddy `EVCP_CADDY_ADDRESS`/`EVCP_STORAGE_CADDY_ADDRESS`, keycloak `KC_HOSTNAME`, platform-api `EVCP_PUBLIC_API_URL`/`EVCP_ADMIN_WEB_URL`/`EVCP_CREATOR_WEB_URL`/`EVCP_STORE_WEB_URL`/`EVCP_S3_PUBLIC_URL`/`KEYCLOAK_ISSUER_URL`/`KEYCLOAK_INTERNAL_ISSUER_URL` stays internal).
- `platform-api` already has a `KeycloakAdminClient` with a generic `put()` (used by user-service) — it can reconcile the OIDC client's `redirectUris` via the admin API (no job re-run).
- `BusinessSettingsRepositoryBackedService` (Postgres) persists business settings — a natural home for the durable domain (source of truth for the app + UI status).
- Caddy already publishes `:80` + `:443`; a domain deploy only needs `EVCP_CADDY_ADDRESS` = the hostname (Caddy then does ACME on 80/443).

## Design decisions (recommended)

1. **Durability = a `domain.env` override the bootstrap sources, with Postgres as the source of truth.** `business_settings.domain` is the app's truth (shown in the UI). On "go live", platform-api also writes `${STACK_ENV_DIR}/domain.env` (the `https://<domain>` values); `bootstrap-swarm.sh`'s `deploy_stack` sources it **after** `stack.env`, so redeploy/reboot/update keep the domain without the shell querying Postgres.
2. **Reconcile Keycloak redirect URIs via the admin API** (`KeycloakAdminClient`) — not a bootstrap-job re-run.
3. **platform-api writes `domain.env` to a bind-mounted `${STACK_ENV_DIR}` (default `/opt/evcp`)** — one added bind mount (it already mounts docker.sock).

## Components

### 1. B-sys extension — `updateServiceEnv`

Add to `swarm-service-engine.ts`: `updateServiceEnv(serviceName, envPatch: Record<string,string>)` — same read-modify-write as `updateServiceImage`, but merges `envPatch` into `Spec.TaskTemplate.ContainerSpec.Env` (an array of `"KEY=VALUE"` strings: replace matching keys, append new ones), bumps `ForceUpdate`, POSTs the raw spec at `?version=<index>`. Passes the raw object as body (nodeSocketRequest encodes it once — same fix as B3).

### 2. `domain-service` (platform-api)

New `apps/platform-api/src/system/domain-service.ts`:
- `getDomainStatus()` → `{ domain: string | null, publicBaseUrl: string, caddyAddress: string }` (domain from business settings; the rest reflects current env).
- `setDomain(domain)`:
  1. Validate `domain` against a hostname regex (`^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$`, lowercased).
  2. Compute the URL set: `base = https://<domain>`, `storage = storage.<domain>`, plus `EVCP_PUBLIC_API_URL=base/api`, `EVCP_ADMIN_WEB_URL=base`, `EVCP_CREATOR_WEB_URL=base`, `EVCP_STORE_WEB_URL=base`, `EVCP_S3_PUBLIC_URL=https://storage.<domain>`, `KEYCLOAK_PUBLIC_URL=base/auth`, `KEYCLOAK_ISSUER_URL=base/auth/realms/<realm>`.
  3. Persist `domain` in business settings.
  4. Write `domain.env` (all the above vars + `EVCP_CADDY_ADDRESS=<domain>` + `EVCP_STORAGE_CADDY_ADDRESS=storage.<domain>`) to `${EVCP_STACK_ENV_DIR:-/opt/evcp}/domain.env`, mode 600.
  5. Reconcile the Keycloak OIDC client redirect URI to `base/api/auth/keycloak/callback` via `KeycloakAdminClient` (GET the `evcp-platform-api` client, PUT with updated `redirectUris`/`webOrigins`).
  6. Roll the running services via `updateServiceEnv` (B-sys): `evcp_caddy` (`EVCP_CADDY_ADDRESS`, `EVCP_STORAGE_CADDY_ADDRESS`), `evcp_keycloak` (`KC_HOSTNAME=base/auth`), then `evcp_platform-api` **last, fire-and-forget** (the public-URL vars). Return `202 { accepted: true, domain }`.

### 3. `bootstrap-swarm.sh` — source the override

In `deploy_stack`, after `. "$STACK_ENV_PATH"`, add: `[ -f "${STACK_ENV_DIR}/domain.env" ] && . "${STACK_ENV_DIR}/domain.env"` (under `set -a`), so the domain values override the freshly-generated IP-first ones on every deploy.

### 4. Compose — bind-mount the config dir into platform-api

Add a bind mount to `platform-api` in `docker-compose.release.yml`: `${EVCP_STACK_ENV_DIR:-/opt/evcp}:/etc/evcp/host` (read-write) and env `EVCP_STACK_ENV_DIR=/etc/evcp/host` so the service writes `domain.env` to the host dir the bootstrap reads. (Manager-pinned already, so the node-local bind mount is present.)

### 5. Admin routes + api-client + UI

- Routes (admin-only, mirror system-routes): `GET /admin/system/domain`, `POST /admin/system/domain { domain }`.
- api-client: `getDomainStatus()`, `setDomain(domain)` + DTOs.
- UI: an Admin **Domain** panel (next to System): current domain/URL, a domain input, a **Go live** button with a clear **precondition warning** — *"point `<domain>` and `storage.<domain>` DNS at this server first; Caddy will request a TLS certificate."* On submit → confirm → `POST` → an "Applying… (Caddy is provisioning a certificate)" state that polls `getDomainStatus()` + the site until `https://<domain>` answers, then "Live at https://<domain>". Presentational page, `@evcp/ui` only.

## Data flow

Admin types domain → `POST /admin/system/domain` → domain-service persists it (business settings + `domain.env`), reconciles Keycloak redirect URIs, then `updateServiceEnv` rolls caddy → keycloak → platform-api (self last, fire-and-forget) → Caddy does ACME on 80/443 and serves TLS. Future `docker stack deploy` sources `domain.env` → the domain sticks.

## Error handling

- Invalid domain → 400. Non-admin → 403.
- DNS not pointed / ACME fails → Caddy keeps serving (old cert or HTTP); the UI's poll times out with "certificate not ready — check DNS and that 80/443 are reachable." Not a stack-breaking state.
- Keycloak reconcile failure → surfaced; the env roll still applied (the admin can retry). Documented.
- `domain.env` write failure (bind mount missing) → 500 with a clear message; nothing half-applied is durable (fail before rolling services).

## Testing

- **Unit:** `updateServiceEnv` (Env array merge: replace existing key, append new, raw-object body); `domain-service` with stubbed engine/keycloak/settings/fs — asserts URL computation, the `domain.env` contents, Keycloak redirect reconcile call, and that platform-api is rolled **last, not awaited**; domain validation.
- **Contract:** `/admin/system/domain` GET/POST require admin; `bootstrap-swarm.sh` sources `domain.env` (extend the bootstrap dry-run/unit test to show a present `domain.env` is applied); the compose bind-mount + `EVCP_STACK_ENV_DIR` present (extend the swarm contract test).
- **Render-smoke:** the Domain panel renders.
- **Live (controller-run, gated):** on the local swarm, `setDomain("app.localhost")` (a domain that resolves locally / with a fake DNS), confirm caddy/keycloak/platform-api env rolled to the domain, `domain.env` written, Keycloak redirect updated, and a redeploy keeps the domain env. (Real Let's Encrypt needs a public domain, so the live test asserts the reconfigure + durability, not a real public cert.)

## Acceptance criteria

- An admin sets a domain from the UI; caddy/keycloak/platform-api switch to `https://<domain>` and Keycloak redirect URIs are reconciled; platform-api rolls last.
- The domain is durable: a subsequent `docker stack deploy` / `install.sh update` keeps it (via `domain.env`).
- Admin-only; invalid domain rejected; a failed cert/DNS doesn't break the running stack.
- Reuses `SwarmServiceEngine` (no docker CLI).

## Out of scope

- Multi-domain / per-app domains, custom certs / bring-your-own-cert, wildcard.
- Auto-DNS provisioning. Reverting to IP-first from the UI (delete `domain.env` + redeploy on the host).
- Email/ACME account configuration UI (Caddy defaults suffice).
