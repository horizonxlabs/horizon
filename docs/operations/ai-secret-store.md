# AI Provider Secret Store Runbook (OpenBao)

Use this runbook before enabling a live AI provider. Provider credentials are entered by an IT administrator through the Admin Console; they must never be committed to `.env`, supplied to a browser, or stored in PostgreSQL plaintext.

## Required runtime contract

Platform API uses OpenBao through its Vault KV v2-compatible API. Configure only the OpenBao endpoint and the mounted workload token location:

```text
VAULT_ADDR=https://openbao.example.internal
VAULT_KV_MOUNT=platform
VAULT_TOKEN_FILE=/run/secrets/evcp-vault-token
```

`VAULT_TOKEN_FILE` is a container-mounted, least-privilege OpenBao workload token. It is not a provider credential and must not be copied into an environment variable or repository. The `VAULT_*` names remain because OpenBao is API-compatible with Vault KV v2.

LiteLLM does not receive `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or any other upstream provider key. It is retained only as the internal virtual-key gateway for isolated workspaces. Governed completion, provider tests, and durable AI jobs call the approved provider through Platform API after resolving its Vault reference.

The token policy must permit only these operations beneath `platform/data/ai-provider-keys/*`:

- `create`, `update` for Admin credential rotation
- `read` for Platform API provider invocation

Do not grant list, delete, root, or unrelated secret paths.

For Docker Compose, `docker/docker-compose.openbao.yml` starts a persistent OpenBao service on
the private `evcp-internal` network. It publishes neither the OpenBao API nor its UI. Keep the
workload token in an operator-owned file outside the repository and start the stack with the
OpenBao override:

```bash
export OPENBAO_TOKEN_FILE_HOST=/secure/operator-path/evcp-openbao-token
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.openbao.yml up -d
```

On first start, an OpenBao operator must initialize and unseal the persistent service, enable the
KV v2 mount, and create the least-privilege workload token. Keep recovery shares and the initial
root token in the organization's approved secure store; never put either in `.env`.

```bash
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.openbao.yml exec -e BAO_ADDR=http://127.0.0.1:8200 openbao bao operator init
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.openbao.yml exec -e BAO_ADDR=http://127.0.0.1:8200 openbao bao operator unseal
docker compose --env-file .env -f docker/docker-compose.yml -f docker/docker-compose.openbao.yml exec -e BAO_ADDR=http://127.0.0.1:8200 openbao bao secrets enable -path=platform kv-v2
```

Set `VAULT_ADDR` only when Platform API must use an externally managed OpenBao cluster instead.

## Admin flow

1. Sign in to Admin Console with the platform administrator role.
2. Create the provider with its API-compatible base URL and approved models.
3. Add or rotate its credential. The browser sends it only to Platform API over TLS.
4. Platform API writes the value to OpenBao and persists only the compatible secret reference, fingerprint, masked suffix, and key version.
5. Configure scenario routes, optional fallback, guardrails, and quotas.
6. Run the Admin provider test call; verify the audit log records provider, model, latency, tokens, cost, and outcome without the key or prompt content.

## Verification

After deployment, Platform API must start without an `unconfigured` AI secret store. Create a provider key from Admin, then verify its database record contains a `vault://<mount>/data/ai-provider-keys/...` reference and `encryptionProvider` is `vault-kv-v2` (the protocol identifier used for OpenBao compatibility).

Submit one governed test call and verify the corresponding execution evidence row. Restart Platform API, repeat the call, and confirm the stored key reference still resolves and the first request's evidence remains intact.

## Failure and rollback

- Missing OpenBao configuration or token: provider-key creation and live execution fail closed.
- OpenBao unavailable or denied: provider invocation fails with a sanitized error; no secret is returned to UI or logs.
- Credential rotation failure: leave the previous Vault version active, correct the policy/value, and retry from Admin. Do not copy the provider key into `.env` as a workaround.
