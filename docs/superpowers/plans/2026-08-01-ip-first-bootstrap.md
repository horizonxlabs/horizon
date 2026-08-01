# IP-first Bootstrap Installer + Docker Secrets — Implementation Plan (B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command on a fresh single-node swarm brings the whole stack up at `http://<ip>:<port>` with no operator secret input — all secrets auto-generated as Docker secrets consumed via `*_FILE`, and OpenBao auto-initialized/unsealed.

**Architecture:** (1) a small file-backed-secrets loader in platform-api; (2) the two compose files consume Docker secrets via `*_FILE` (native for postgres/minio, an entrypoint shim for keycloak/litellm, the loader for platform-api) and default to IP-first public URLs; (3) `scripts/install/bootstrap-swarm.sh` generates secrets, deploys, and bootstraps OpenBao.

**Tech Stack:** Docker Swarm ≥25, Bash, Node (`tsx` test runner), the existing `scripts/install/*.mjs` framework, `yaml` parser for contract tests.

## Global Constraints

- Single-node swarm; stack name `evcp`; overlay `evcp_evcp-internal`; Docker ≥25.
- No plaintext secret in any `environment:` or in `stack.env`. Sensitive values are **external Docker secrets** created by the bootstrap script BEFORE `docker stack deploy`.
- Secret names (exact): `evcp_postgres_password`, `evcp_minio_root_user`, `evcp_minio_root_password`, `evcp_litellm_master_key`, `evcp_litellm_database_url`, `evcp_workspace_secret_key`, `evcp_ai_job_encryption_key`, `evcp_keycloak_admin_password`, `evcp_keycloak_platform_client_secret`, `evcp_keycloak_admin_client_secret`, `evcp_session_secret`, `evcp_openbao_token`.
- IP-first: `EVCP_CADDY_ADDRESS` default `:80` (HTTP, no TLS); Keycloak `--hostname-strict=false`; public URLs default to `http://<ip>:<port>`.
- Only ONE application file changes (`apps/platform-api/src/config/file-backed-secrets.ts` + its call in `main.ts`).
- Branch: `codex/ip-first-bootstrap` (holds the design spec; off the swarm-stack branch).

---

### Task 1: platform-api file-backed secret loader

**Files:**
- Create: `apps/platform-api/src/config/file-backed-secrets.ts`
- Modify: `apps/platform-api/src/main.ts` (first executable statement)
- Test: `tests/unit/file-backed-secrets.test.mjs`

**Interfaces:**
- Produces: `hydrateFileBackedSecrets(env?: NodeJS.ProcessEnv): void`.

- [ ] **Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateFileBackedSecrets } from "../../apps/platform-api/src/config/file-backed-secrets.ts";

test("hydrates a var from its _FILE, trimmed", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "pg"), "s3cret\n");
  const env = { POSTGRES_PASSWORD_FILE: join(dir, "pg") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.POSTGRES_PASSWORD, "s3cret");
});

test("does not overwrite an already-set var", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "pg"), "fromfile");
  const env = { POSTGRES_PASSWORD: "preset", POSTGRES_PASSWORD_FILE: join(dir, "pg") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.POSTGRES_PASSWORD, "preset");
});

test("ignores a var whose _FILE is unset or missing", () => {
  const env = { SESSION_SECRET_FILE: "/no/such/file" };
  hydrateFileBackedSecrets(env);
  assert.equal(env.SESSION_SECRET, undefined);
});

test("only hydrates allowlisted vars", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "x"), "v");
  const env = { NOT_ALLOWED_FILE: join(dir, "x") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.NOT_ALLOWED, undefined);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --import tsx --test tests/unit/file-backed-secrets.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement `file-backed-secrets.ts`**

```ts
import { readFileSync } from "node:fs";

// Vars that may be delivered as a Docker secret file (`<NAME>_FILE`) instead of a plaintext
// env var. Kept as an explicit allowlist so an attacker-controlled `*_FILE` cannot inject
// arbitrary env. VAULT_TOKEN_FILE is intentionally absent — app-factory already reads it directly.
const FILE_BACKED = [
  "POSTGRES_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "EVCP_LITELLM_MASTER_KEY",
  "EVCP_WORKSPACE_SECRET_KEY",
  "EVCP_AI_JOB_ENCRYPTION_KEY",
  "KEYCLOAK_PLATFORM_CLIENT_SECRET",
  "KEYCLOAK_ADMIN_CLIENT_SECRET",
  "SESSION_SECRET"
] as const;

export function hydrateFileBackedSecrets(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of FILE_BACKED) {
    const file = env[`${name}_FILE`];
    if (!file || env[name]) continue;
    try {
      env[name] = readFileSync(file, "utf8").trim();
    } catch {
      // Missing/unreadable secret file: leave the var unset so downstream config validation
      // reports the real "missing X" error rather than a file path.
    }
  }
}
```

- [ ] **Step 4: Wire it into `main.ts`** as the FIRST executable statement:

```ts
import { hydrateFileBackedSecrets } from "./config/file-backed-secrets";
hydrateFileBackedSecrets();
// ...existing imports/bootstrap follow (import order: keep this import + call above the first process.env read)
```
Note: because ESM hoists imports, place `hydrateFileBackedSecrets()` before the first line that reads `process.env` (the `const port = Number(process.env.PORT ...)`). Keep the import at the top with the others; the call is the first statement.

- [ ] **Step 5: Run tests + typecheck** — `node --import tsx --test tests/unit/file-backed-secrets.test.mjs` PASS; `pnpm --filter @evcp/platform-api typecheck` clean.

- [ ] **Step 6: Commit** — `git commit -m "feat(platform-api): hydrate file-backed (docker secret) env vars at startup"`

---

### Task 2: Bootstrap-ready compose — Docker secrets via `*_FILE` + IP-first defaults

**Files:**
- Modify: `docker/docker-compose.release.yml`, `docker/docker-compose.openbao.yml`
- Create: `docker/secrets-entrypoint.sh` (shim for keycloak/litellm)
- Test: `tests/integration/swarm-stack-contract.test.mjs` (extend)

**Interfaces:**
- Consumes: external Docker secrets (names in Global Constraints), created by Task 3's script.
- Produces: compose files where no plaintext secret remains in `environment:`, and IP-first defaults apply.

- [ ] **Step 1: Add the top-level external `secrets:` block** to `docker-compose.release.yml`:

```yaml
secrets:
  evcp_postgres_password: { external: true }
  evcp_minio_root_user: { external: true }
  evcp_minio_root_password: { external: true }
  evcp_litellm_master_key: { external: true }
  evcp_litellm_database_url: { external: true }
  evcp_workspace_secret_key: { external: true }
  evcp_ai_job_encryption_key: { external: true }
  evcp_keycloak_admin_password: { external: true }
  evcp_keycloak_platform_client_secret: { external: true }
  evcp_keycloak_admin_client_secret: { external: true }
  evcp_session_secret: { external: true }
```

- [ ] **Step 2: Convert each service to `*_FILE`** (remove the plaintext `${VAR:?}` secret env; add `secrets:` mount + `*_FILE` env):

- **postgres:** `secrets: [evcp_postgres_password]`; env `POSTGRES_PASSWORD_FILE: /run/secrets/evcp_postgres_password` (drop `POSTGRES_PASSWORD`).
- **minio:** `secrets: [evcp_minio_root_user, evcp_minio_root_password]`; env `MINIO_ROOT_USER_FILE` / `MINIO_ROOT_PASSWORD_FILE` (drop the plaintext pair).
- **litellm-db-init / keycloak-db-init:** these need the pg password to run `psql`. Add `secrets: [evcp_postgres_password]` and change their command to read it: `PGPASSWORD="$(cat /run/secrets/evcp_postgres_password)"` at the top of the `sh -lc` command (drop the `PGPASSWORD: ${POSTGRES_PASSWORD}` env).
- **keycloak:** add `secrets: [evcp_postgres_password, evcp_keycloak_admin_password]`; drop `KC_DB_PASSWORD` and `KC_BOOTSTRAP_ADMIN_PASSWORD` plaintext env; wrap with the shim (Step 3) so it exports `KC_DB_PASSWORD` and `KC_BOOTSTRAP_ADMIN_PASSWORD` from `/run/secrets/*` then execs `kc.sh` with the existing `start --import-realm --http-enabled=true --http-port=8080 --proxy-headers=xforwarded --hostname-strict=false` args.
- **litellm:** add `secrets: [evcp_litellm_master_key, evcp_litellm_database_url]`; drop the three plaintext env (`LITELLM_MASTER_KEY`, `DATABASE_URL`, `LITELLM_DATABASE_URL`); wrap with the shim so it exports `LITELLM_MASTER_KEY`, `DATABASE_URL`, `LITELLM_DATABASE_URL` from `/run/secrets/*` then execs `litellm --config /etc/litellm/litellm-config.yaml`.
- **platform-api:** add `secrets: [evcp_postgres_password, evcp_minio_root_user, evcp_minio_root_password, evcp_litellm_master_key, evcp_workspace_secret_key, evcp_ai_job_encryption_key, evcp_keycloak_platform_client_secret, evcp_keycloak_admin_client_secret, evcp_session_secret]`; replace each plaintext secret env with its `*_FILE` form (`POSTGRES_PASSWORD_FILE`, `MINIO_ROOT_USER_FILE`, `MINIO_ROOT_PASSWORD_FILE`, `EVCP_LITELLM_MASTER_KEY_FILE`, `EVCP_WORKSPACE_SECRET_KEY_FILE`, `EVCP_AI_JOB_ENCRYPTION_KEY_FILE`, `KEYCLOAK_PLATFORM_CLIENT_SECRET_FILE`, `KEYCLOAK_ADMIN_CLIENT_SECRET_FILE`, `SESSION_SECRET_FILE`), each `/run/secrets/<name>`. The app hydrates them (Task 1). Keep all non-secret env as-is.

- [ ] **Step 3: Write `docker/secrets-entrypoint.sh`** (delivered as a config, used by keycloak + litellm):

```sh
#!/bin/sh
# Export <VAR>=$(cat <VAR>_FILE) for any *_FILE env, then exec the real command.
# Lets images that don't natively read Docker secret files (keycloak, litellm) consume them.
set -e
for f in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)_FILE=.*/\1/p'); do
  eval "file=\${${f}_FILE}"
  if [ -f "$file" ]; then export "$f=$(cat "$file")"; fi
done
exec "$@"
```
Declare it as a config and set on keycloak/litellm:
```yaml
    entrypoint: ["/bin/sh", "/etc/evcp/secrets-entrypoint.sh"]
    # keycloak: append the kc.sh invocation as the command; litellm: the litellm invocation
    configs:
      - source: secrets-entrypoint
        target: /etc/evcp/secrets-entrypoint.sh
```
For keycloak set env `KC_DB_PASSWORD_FILE: /run/secrets/evcp_postgres_password`, `KC_BOOTSTRAP_ADMIN_PASSWORD_FILE: /run/secrets/evcp_keycloak_admin_password` and `command: /opt/keycloak/bin/kc.sh start --import-realm --http-enabled=true --http-port=8080 --proxy-headers=xforwarded --hostname-strict=false`. For litellm set `LITELLM_MASTER_KEY_FILE`, `DATABASE_URL_FILE`, `LITELLM_DATABASE_URL_FILE` → `/run/secrets/evcp_litellm_*` and `command: litellm --config /etc/litellm/litellm-config.yaml`. Add `secrets-entrypoint` to the top-level `configs:` block (`file: ./secrets-entrypoint.sh`).
  (First: quickly confirm whether keycloak 26 / litellm read `*_FILE` natively; if a given image does, use the native var and skip the shim for it. The shim is the guaranteed-correct fallback.)

- [ ] **Step 4: IP-first defaults** in `docker-compose.release.yml`:
- keycloak `KC_HOSTNAME: ${KEYCLOAK_PUBLIC_URL:?...}` stays (the script sets it to `http://<ip>:<port>/auth`); ensure the command includes `--hostname-strict=false` (added in Step 2/3).
- caddy: no file change needed — `EVCP_CADDY_ADDRESS` default becomes `:80` via `stack.env` (Task 3). Confirm `Caddyfile.release`'s `{$EVCP_CADDY_ADDRESS:localhost}` accepts `:80` (it does — a site address of `:80` serves all hosts over HTTP).

- [ ] **Step 5: openbao overlay** — add `evcp_openbao_token: { external: true }` to its `secrets:` (created by Task 3), keep the platform-api `VAULT_TOKEN_FILE: /run/secrets/evcp-openbao-token` → change the secret reference to the external `evcp_openbao_token` (align the mounted target name).

- [ ] **Step 6: Extend the contract test** — assert: the external `secrets:` block declares all listed names; no service `environment:` contains a plaintext `${...PASSWORD...}`/`..._SECRET`/`..._KEY` (only `*_FILE`); keycloak/litellm use the shim entrypoint; `EVCP_CADDY_ADDRESS` default resolves to `:80` intent (documented); `secrets-entrypoint` config declared.

- [ ] **Step 7: Validate + test**

`docker stack config` on both files renders (with the external secrets present on the host, or use `--skip-interpolation`-style dummy env); `node --import tsx --test tests/integration/swarm-stack-contract.test.mjs` PASS; reconcile any existing contract test that asserted the old plaintext env.

- [ ] **Step 8: Commit** — `git commit -m "feat(deploy): consume secrets via docker secret *_FILE + IP-first defaults"`

---

### Task 3: `bootstrap-swarm.sh` + OpenBao auto-bootstrap + installer integration

**Files:**
- Create: `scripts/install/bootstrap-swarm.sh`
- Modify: `scripts/install/preflight.mjs` (swarm/docker checks), `package.json` (a `bootstrap:swarm` script + dry-run)
- Test: `tests/unit/bootstrap-swarm.test.mjs` (headless assertions of the script's plan/secret list), extend `tests/e2e` install CLI coverage if present

**Interfaces:**
- Produces: an idempotent installer with subcommands `bootstrap-swarm.sh` (full), `unseal`, `update`.

- [ ] **Step 1: Write failing headless tests** asserting the script (a) declares exactly the Global-Constraints secret names, (b) generates each missing secret with ≥32 bytes entropy, (c) writes an IP-first `stack.env` with `EVCP_CADDY_ADDRESS=:80` and `http://<ip>` public URLs and NO secret, (d) is idempotent (re-run creates nothing new). Drive it in `--dry-run` (print plan as JSON, create nothing).

- [ ] **Step 2: Run, verify red.**

- [ ] **Step 3: Implement `bootstrap-swarm.sh`** with the ordered flow from the spec (Component 1): preflight; `docker swarm init --advertise-addr <detected-ip>` (skip if manager); for each secret name, `docker secret inspect <name> >/dev/null 2>&1 || <gen> | docker secret create <name> -`; write `/opt/evcp/stack.env` (IP-first, non-secret); optional `docker login ghcr.io`; `docker stack deploy -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml --with-registry-auth evcp`; run the `openbao` subroutine; print the URL. Provide `--dry-run` that prints the plan and creates nothing. `gen`: `openssl rand -hex 32` (fallback `head -c32 /dev/urandom | xxd -p -c256`). `evcp_litellm_database_url` = `postgresql://evcp:<pg-secret>@postgres:5432/litellm` built from the postgres secret.

- [ ] **Step 4: OpenBao subroutine (`bootstrap-swarm.sh openbao` / `unseal`)** — wait for the openbao task; if not initialized, `bao operator init -key-shares=1 -key-threshold=1 -format=json`, store the unseal key + root token as Docker secrets `evcp_openbao_unseal` / `evcp_openbao_root` and print a one-time "move these to your org secure store" warning; `bao operator unseal <key>` (idempotent); `bao secrets enable -path=platform kv-v2` (ignore "already enabled"); write the least-privilege policy for `platform/data/ai-provider-keys/*`; `bao token create -policy=evcp-workload -orphan -period=8760h -field=token` → `docker secret create evcp_openbao_token -` (only if absent). `unseal` subcommand: read `evcp_openbao_unseal` and unseal (for post-reboot).

- [ ] **Step 5: `update` subcommand** — re-`docker stack deploy` with a new `EVCP_VERSION` (no secret regen), then `unseal`.

- [ ] **Step 6: Run tests** — `node --import tsx --test tests/unit/bootstrap-swarm.test.mjs` PASS; `pnpm check` green.

- [ ] **Step 7: Commit** — `git commit -m "feat(install): bootstrap-swarm.sh — one-command IP-first swarm install"`

---

### Task 4: Live bootstrap smoke + runbook

**Files:**
- Modify: `docs/operations/swarm-deploy.md` (add the one-command path)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Run `bootstrap-swarm.sh` end-to-end** on the local single-node swarm (public images for infra; app images may be absent → those services pending, acceptable). GATED: real Docker on the host — controller-run, isolated stack name if needed.
- [ ] **Step 2: Assert** all secrets created; postgres/minio/keycloak/openbao converge; OpenBao inits, unseals, KV `platform` present, `evcp_openbao_token` secret created; `curl http://<ip>:<port>` serves the Admin Console (or, with app images absent, that Caddy answers).
- [ ] **Step 3: Prove idempotency + `unseal`** — re-run creates no new secrets; `docker stack rm evcp` + redeploy + `unseal` brings it back.
- [ ] **Step 4: Document** the one-command install in `docs/operations/swarm-deploy.md`; tear down.
- [ ] **Step 5: Commit** — `git commit -m "docs: one-command IP-first bootstrap runbook + smoke"`

---

## Self-review notes

- **Spec coverage:** loader (T1), docker secrets via `*_FILE` + shim + IP-first (T2), bootstrap script + OpenBao (T3), live smoke + runbook (T4). All spec components mapped.
- **Secret set** is identical across Global Constraints, T2 `secrets:` block, and T3 generation loop.
- **`*_FILE` native vs shim:** T2 Step 3 confirms native support per image and falls back to the shim (guaranteed correct).
- **No secret in `stack.env`** — enforced by the T3 test.
- **OpenBao unseal after reboot** stays a subcommand (KMS auto-unseal is deferred to B2), consistent with the spec's Out of Scope.
