#!/bin/sh
# Persistent-dev OpenBao bootstrap: run the server on file storage, then (once) initialize +
# unseal it and mint a fixed `dev-root-token` so the platform-api keeps using the same token it
# always has. On restart the data is already on the volume — we just re-unseal. This keeps AI
# provider secrets across `docker compose up` recreations.
set -e
export BAO_ADDR="http://127.0.0.1:8200"
DATA_DIR="/openbao/data"
INIT_FILE="${DATA_DIR}/init.json"

bao server -config=/openbao/config/config.hcl &
SERVER_PID="$!"

# Wait until the API answers (exit 1 = not responding; 0 = unsealed, 2 = sealed).
while true; do
  bao status >/dev/null 2>&1 && break
  [ "$?" = "2" ] && break
  sleep 1
done

# Initialize once (single unseal key for dev convenience).
if [ ! -f "${INIT_FILE}" ]; then
  bao operator init -key-shares=1 -key-threshold=1 -format=json >"${INIT_FILE}"
fi
# `bao operator init -format=json` pretty-prints, so parse across lines (no jq in the image).
UNSEAL_KEY="$(grep -A1 '"unseal_keys_b64"' "${INIT_FILE}" | tail -1 | sed 's/[^"]*"\([^"]*\)".*/\1/')"
ROOT_TOKEN="$(grep '"root_token"' "${INIT_FILE}" | sed 's/.*: *"\([^"]*\)".*/\1/')"

# Unseal (no-op if already unsealed after a warm restart).
bao operator unseal "${UNSEAL_KEY}" >/dev/null 2>&1 || true

export BAO_TOKEN="${ROOT_TOKEN}"
# The KV v2 engine at secret/ (auto-mounted by -dev) + a broad dev policy + a fixed-id token, so
# platform-api's hard-coded dev-root-token keeps working. All idempotent across restarts.
bao secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true
bao policy write evcp-dev - >/dev/null 2>&1 <<'POLICY' || true
path "secret/*" { capabilities = ["create", "read", "update", "delete", "list"] }
POLICY
bao token create -id=dev-root-token -policy=evcp-dev -orphan -period=8760h >/dev/null 2>&1 || true

wait "${SERVER_PID}"
