# IP-first Bootstrap Installer + Docker Secrets — Design (B1)

**Status:** Draft for review.
**Date:** 2026-08-01
**Scope:** Sub-project B1 of the "easy setup" program (inspired by Dokploy's one-command install). B2 (in-UI go-live with a domain + TLS + KMS auto-unseal) is a later, separate spec. Builds on the swarm-ready release stack (PR #170 / `docs/superpowers/specs/2026-07-29-swarm-release-stack.md`).

## Goal

Reduce production first-boot from ~7 manual steps + a 25-field `.env` + a manual OpenBao init/unseal dance to **one command with no secret input**:

```bash
curl -sSL <raw>/scripts/install/bootstrap-swarm.sh | bash    # or run the checked-out script
```

The script initializes a single-node swarm, **auto-generates every secret** and stores them as **Docker secrets**, deploys the stack addressable by the server's **IP over HTTP** (no domain/TLS required yet), auto-initializes and unseals OpenBao, and prints a URL to open the Admin Console — where the operator finishes setup (admin account, AI providers). Adding a real domain + TLS is B2.

## Background

- The release stack (`docker/docker-compose.release.yml` + `docker-compose.openbao.yml`) already deploys via `docker stack deploy` on a single-node swarm, but expects every secret and public URL supplied through a manager-side `.env` (interpolated), and OpenBao to be initialized/unsealed by hand.
- The frontends call `/api` and `/auth` **same-origin** through Caddy and **do not bake any API URL at build time** (`docker/web-app.Dockerfile` has no `VITE_*` build args), so the stack can be served from a bare `http://<IP>:<port>` with no image rebuild. Only backend env pins public URLs (Keycloak issuer/hostname + redirect URIs, `EVCP_PUBLIC_API_URL`, `EVCP_*_WEB_URL`, `EVCP_S3_PUBLIC_URL`).
- `apps/platform-api/src/main.ts` reads `process.env` first and everything downstream defaults to it; `VAULT_TOKEN_FILE` already demonstrates a file-backed secret. So one hydration point at the top of `main.ts` can generalize file-backed secrets to all consumers.

## Global constraints

- Docker Engine ≥ 25; single-node swarm; stack name `evcp`.
- **No operator secret input.** The only optional inputs are environment overrides (`EVCP_VERSION`, `EVCP_IMAGE_REPOSITORY`, `ADVERTISE_ADDR`, GHCR credentials); the script auto-detects/derives sensible defaults.
- Secrets are **Docker secrets** consumed via `*_FILE`, never plaintext in `.env` or service `environment:`.
- IP-first: on first boot the platform is reachable at `http://<ADVERTISE_ADDR>:<EVCP_HTTP_PORT>` with no TLS; no domain required.
- Idempotent + re-runnable (for version updates and re-unseal).

## Components

### 1. `scripts/install/bootstrap-swarm.sh`

Ordered, idempotent:
1. **Preflight:** Docker ≥ 25 present; ports free; detect `ADVERTISE_ADDR` (default: primary non-loopback IPv4).
2. **Swarm:** `docker swarm init --advertise-addr <ip>` (skip if already a manager).
3. **Secrets:** for each sensitive value, if the Docker secret does not exist, generate it (`openssl rand -hex 32` / `-base64`) and `docker secret create`. Secrets: `evcp_postgres_password`, `evcp_minio_root_user`, `evcp_minio_root_password`, `evcp_litellm_master_key`, `evcp_workspace_secret_key`, `evcp_ai_job_encryption_key`, `evcp_keycloak_admin_password`, `evcp_keycloak_platform_client_secret`, `evcp_keycloak_admin_client_secret`, `evcp_session_secret`. (`docker secret create` is skipped when the secret already exists — idempotent; existing secrets are never rotated by re-runs.)
4. **Non-secret env:** write a small `/opt/evcp/stack.env` with IP-first public URLs and non-secret config (`EVCP_VERSION`, `EVCP_IMAGE_REPOSITORY`, `EVCP_CADDY_ADDRESS=:80`, `EVCP_PUBLIC_API_URL=http://<ip>:<port>`, `EVCP_*_WEB_URL`, `KEYCLOAK_PUBLIC_URL=http://<ip>:<port>/auth`, `KEYCLOAK_ISSUER_URL`, `EVCP_S3_PUBLIC_URL=http://<ip>:<port>` etc.). No secrets here.
5. **Registry:** if GHCR creds provided, `docker login ghcr.io`.
6. **Deploy:** `set -a; . /opt/evcp/stack.env; set +a; docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml --with-registry-auth evcp`.
7. **OpenBao bootstrap** (`bootstrap-swarm.sh openbao` subroutine, also runnable standalone): wait for the openbao task, `bao operator init` (once; store unseal key + root token as Docker secrets `evcp_openbao_unseal`/`evcp_openbao_root` and print a one-time warning to move them to the org secure store), `bao operator unseal`, `bao secrets enable -path=platform kv-v2`, write the least-privilege workload policy (`platform/data/ai-provider-keys/*`), `bao token create` → store as `evcp_openbao_token` Docker secret. Re-run safely (idempotent; only unseals if sealed).
8. **Print:** `Open http://<ip>:<port> to finish setup in the Admin Console.`

Subcommands: `bootstrap-swarm.sh` (full), `... unseal` (re-unseal after reboot), `... update` (redeploy a new `EVCP_VERSION`).

### 2. Docker-secret consumption in the compose files

Add a top-level `secrets:` block (external secrets created by the script) and, per service, mount + point at `*_FILE`:
- **postgres:** `POSTGRES_PASSWORD_FILE=/run/secrets/evcp_postgres_password` (native).
- **minio:** `MINIO_ROOT_USER_FILE` / `MINIO_ROOT_PASSWORD_FILE` (native).
- **platform-api:** mount the secrets; set `*_FILE` env pointing at them (`POSTGRES_PASSWORD_FILE`, `EVCP_WORKSPACE_SECRET_KEY_FILE`, `EVCP_LITELLM_MASTER_KEY_FILE`, `KEYCLOAK_PLATFORM_CLIENT_SECRET_FILE`, `KEYCLOAK_ADMIN_CLIENT_SECRET_FILE`, `EVCP_AI_JOB_ENCRYPTION_KEY_FILE`, `MINIO_ROOT_USER_FILE`, `MINIO_ROOT_PASSWORD_FILE`, `SESSION_SECRET_FILE`); the app hydrates them (component 3).
- **keycloak / litellm:** these images do not universally read `*_FILE`. Wrap each with a tiny **entrypoint shim** (`scripts/install/secrets-entrypoint.sh`, delivered as a swarm `config`) that exports `VAR=$(cat "$VAR_FILE")` for the listed vars then `exec`s the image's original entrypoint/command. Keycloak needs `KC_DB_PASSWORD`, `KC_BOOTSTRAP_ADMIN_PASSWORD`; litellm needs `LITELLM_MASTER_KEY`, `DATABASE_URL`/`LITELLM_DATABASE_URL`. (The plan confirms each image's native `*_FILE` support first and uses it where available, falling back to the shim.)

The manager-side `stack.env` no longer carries any secret; interpolation only fills non-secret config.

### 3. platform-api file-backed secret loader

New module `apps/platform-api/src/config/file-backed-secrets.ts`:
```ts
export function hydrateFileBackedSecrets(env: NodeJS.ProcessEnv = process.env): void
```
For an allowlist of var names, if `env[`${NAME}_FILE`]` is set and `env[NAME]` is empty, read the file (UTF-8, trimmed) into `env[NAME]`. Called as the **first statement** in `apps/platform-api/src/main.ts`, before any other import-time env reads. Allowlist: `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EVCP_LITELLM_MASTER_KEY`, `EVCP_WORKSPACE_SECRET_KEY`, `EVCP_AI_JOB_ENCRYPTION_KEY`, `KEYCLOAK_PLATFORM_CLIENT_SECRET`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `SESSION_SECRET`. This is the only application code change; `VAULT_TOKEN_FILE` stays as-is (already file-based downstream).

### 4. IP-first stack defaults

- **Caddy:** `EVCP_CADDY_ADDRESS` defaults to `:80` (Caddy serves the site on port 80 for any host, HTTP only — no automatic TLS for a bare IP). The storage vhost binds the same way. No TLS block on first boot.
- **Keycloak:** `KC_HOSTNAME=http://<ip>:<port>/auth`, keep `--proxy-headers=xforwarded`, and set `--hostname-strict=false` so IP access works. Realm/client redirect URIs are reconciled by `bootstrap-clients.sh` from `EVCP_PUBLIC_API_URL` (already IP-based).
- All `EVCP_PUBLIC_*` / `EVCP_*_WEB_URL` / `EVCP_S3_PUBLIC_URL` default to the detected `http://<ip>:<port>` form.

## Data flow

`bootstrap-swarm.sh` → creates Docker secrets + `stack.env` → `docker stack deploy` → services read secrets via `*_FILE` (native, shim, or platform-api hydrator) → OpenBao inited/unsealed, token stored as a secret → platform-api resolves it via `VAULT_TOKEN_FILE`. Browser hits `http://<ip>:<port>`; Caddy serves the SPA and proxies `/api` + `/auth` same-origin.

## Error handling

- Missing Docker / version < 25 / busy ports → the script exits early with a clear message (extend the existing `preflight.mjs` checks).
- Secret already exists → skip creation (idempotent); never silently rotate.
- OpenBao already initialized → skip init, only unseal; sealed after reboot → `bootstrap-swarm.sh unseal`.
- App images fail to pull (bad GHCR creds) → those services stay pending; the script reports which.

## Testing

- **Unit:** `hydrateFileBackedSecrets` (reads `*_FILE`, trims, does not overwrite a set var, ignores missing files); a secret-name/derivation helper.
- **Contract (integration):** the compose files declare the external `secrets:` and every listed service references the right `*_FILE` (extend `tests/integration/swarm-stack-contract.test.mjs`); no plaintext secret remains in any `environment:`; IP-first defaults present (`EVCP_CADDY_ADDRESS` default `:80`, Keycloak `--hostname-strict=false`).
- **Installer:** extend `scripts/install/*.mjs` + their tests so bootstrap has a dry-run/plan mode and headless assertions (mirrors `install:plan`/`verify:install`).
- **Live smoke (single-node swarm):** run `bootstrap-swarm.sh` end to end; assert all secrets created, services converge, OpenBao unseals + KV `platform` exists + token secret present, and `curl http://<ip>:<port>` serves the Admin Console. Tear down.

## Acceptance criteria

- One command on a fresh VM brings the whole stack up reachable at `http://<ip>:<port>` with zero secret input.
- All sensitive values are Docker secrets consumed via `*_FILE`; none appear in `environment:` or `stack.env`.
- OpenBao is initialized, unsealed, KV `platform` mounted, workload token stored as a secret.
- Re-running the script is safe (no secret rotation, no duplicate init); `... unseal` re-unseals after reboot.
- Only one application file changes (`file-backed-secrets.ts` + its call in `main.ts`).

## Out of scope (→ B2 / later)

- In-UI "go live" domain + Let's Encrypt TLS + reconfiguring Keycloak/Caddy/platform-api for the domain.
- OpenBao **auto-unseal** via GCP Cloud KMS (unseal stays a re-runnable subcommand until then).
- Multi-node swarm; secret rotation workflows.
