#!/bin/sh
# bootstrap-swarm.sh — one-command IP-first Docker Swarm bootstrap for EVCP.
#
# Brings up the whole private-server stack at http://<detected-ip>:<port> with zero
# operator secret input: initializes a single-node swarm, generates every Docker
# secret listed in docs/superpowers/plans/2026-08-01-ip-first-bootstrap.md's Global
# Constraints (idempotently — an existing secret is NEVER rotated), writes an
# IP-first, secret-free /opt/evcp/stack.env, deploys the release + openbao compose
# overlays, and bootstraps/unseals OpenBao.
#
# Usage:
#   bootstrap-swarm.sh [--dry-run]                 full bootstrap (default)
#   bootstrap-swarm.sh openbao [--dry-run]          (re-)run the OpenBao init/policy subroutine
#   bootstrap-swarm.sh unseal                       unseal OpenBao after a host reboot
#   bootstrap-swarm.sh update <version> [--dry-run] bump EVCP_VERSION in stack.env + redeploy
#
# --dry-run never touches docker (guarded so it also works with no docker daemon,
# e.g. in CI) and prints the plan as JSON to stdout instead of creating anything.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)
DOCKER_DIR="${REPO_ROOT}/docker"

STACK_NAME="evcp"
STACK_ENV_DIR="${EVCP_STACK_ENV_DIR:-/opt/evcp}"
STACK_ENV_PATH="${STACK_ENV_DIR}/stack.env"
# The OpenBao workload token is bind-mounted (not a Docker secret) because it is minted after
# OpenBao is running; bootstrap writes a placeholder here before deploy and the real token after.
TOKEN_FILE_HOST="${OPENBAO_TOKEN_FILE_HOST:-${STACK_ENV_DIR}/openbao-token}"

# Exact 11 Docker secret names from the plan's Global Constraints list. Keep in sync
# with the `secrets:` block in docker/docker-compose.release.yml and
# RELEASE_SECRET_NAMES in tests/integration/swarm-stack-contract.test.mjs.
SECRET_NAMES="evcp_postgres_password evcp_database_url evcp_litellm_database_url evcp_minio_root_user evcp_minio_root_password evcp_litellm_master_key evcp_workspace_secret_key evcp_ai_job_encryption_key evcp_keycloak_admin_password evcp_keycloak_platform_client_secret evcp_keycloak_admin_client_secret evcp_session_secret"

DRY_RUN=0
DOCKER_PRESENT=0

log() {
  printf '%s\n' "$*" >&2
}

# ---------------------------------------------------------------------------
# docker/openssl helpers (all guarded so --dry-run never requires a live daemon)
# ---------------------------------------------------------------------------

check_docker_preflight() {
  if ! command -v docker >/dev/null 2>&1; then
    if [ "$DRY_RUN" = "1" ]; then
      log "warning: docker not found on PATH; continuing in --dry-run without live docker checks"
      DOCKER_PRESENT=0
      return 0
    fi
    echo "ERROR: docker is required but was not found on PATH." >&2
    exit 1
  fi

  version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "")
  if [ -z "$version" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "warning: could not reach the docker daemon; continuing in --dry-run without live docker checks"
      DOCKER_PRESENT=0
      return 0
    fi
    echo "ERROR: could not query the docker server version. Is the Docker daemon running?" >&2
    exit 1
  fi

  DOCKER_PRESENT=1
  major=$(printf '%s' "$version" | cut -d. -f1)
  case "$major" in
    ''|*[!0-9]*) major=0 ;;
  esac
  if [ "$major" -lt 25 ]; then
    echo "ERROR: docker >= 25 is required (found ${version})." >&2
    exit 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is required but was not found on PATH." >&2
    exit 1
  fi
}

docker_secret_exists() {
  name="$1"
  [ "$DOCKER_PRESENT" = "1" ] || return 1
  docker secret inspect "$name" >/dev/null 2>&1
}

swarm_action_plan() {
  if [ "$DOCKER_PRESENT" != "1" ]; then
    printf 'unknown (docker unavailable)'
    return 0
  fi
  state=$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || echo "inactive")
  if [ "$state" = "active" ]; then
    printf 'skip (already manager)'
  else
    printf 'init'
  fi
}

gen_hex32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c32 /dev/urandom | xxd -p -c256
  fi
}

detect_advertise_addr() {
  if [ -n "${EVCP_ADVERTISE_ADDR:-}" ]; then
    printf '%s' "${EVCP_ADVERTISE_ADDR}"
    return 0
  fi
  addr=""
  if command -v ip >/dev/null 2>&1; then
    addr=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)
  fi
  if [ -z "$addr" ] && command -v ifconfig >/dev/null 2>&1; then
    addr=$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -n1)
  fi
  if [ -z "$addr" ] && command -v hostname >/dev/null 2>&1; then
    addr=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  printf '%s' "$addr"
}

# ---------------------------------------------------------------------------
# secret plan/generation
# ---------------------------------------------------------------------------

# Only set when evcp_postgres_password is freshly generated in *this* run — a
# Docker secret's plaintext can never be read back, so evcp_litellm_database_url
# can only be derived from it in the same run it is created.
PG_PASSWORD_VALUE=""
PG_PASSWORD_FRESH=0

generate_secret_value() {
  name="$1"
  case "$name" in
    evcp_minio_root_user)
      printf 'evcpminio%s' "$(gen_hex32 | cut -c1-8)"
      ;;
    evcp_database_url | evcp_litellm_database_url)
      # Both DB URLs embed the postgres password, which a Docker secret never reveals again, so
      # they can only be derived in the same run the password is freshly generated.
      if [ "$PG_PASSWORD_FRESH" != "1" ]; then
        echo "ERROR: ${name} is missing but evcp_postgres_password already exists." >&2
        echo "       A Docker secret's value can never be read back, so these are derived only when" >&2
        echo "       the password is freshly created. Remove docker secret evcp_postgres_password" >&2
        echo "       evcp_database_url evcp_litellm_database_url and re-run bootstrap-swarm.sh." >&2
        exit 1
      fi
      if [ "$name" = "evcp_database_url" ]; then
        printf 'postgresql://evcp:%s@postgres:5432/evcp?schema=public' "$PG_PASSWORD_VALUE"
      else
        printf 'postgresql://evcp:%s@postgres:5432/litellm' "$PG_PASSWORD_VALUE"
      fi
      ;;
    *)
      gen_hex32
      ;;
  esac
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Builds "secrets" JSON plan + (outside --dry-run) actually creates missing secrets.
# Prints the JSON array body (no surrounding []) on stdout.
plan_and_create_secrets() {
  first=1
  for name in $SECRET_NAMES; do
    if docker_secret_exists "$name"; then
      entry=$(printf '{"name":"%s","action":"exists, skip"}' "$name")
    else
      value=$(generate_secret_value "$name")
      bytes=${#value}
      entry=$(printf '{"name":"%s","action":"create","bytes":%s}' "$name" "$bytes")
      if [ "$name" = "evcp_postgres_password" ]; then
        PG_PASSWORD_VALUE="$value"
        PG_PASSWORD_FRESH=1
      fi
      if [ "$DRY_RUN" != "1" ]; then
        printf '%s' "$value" | docker secret create "$name" - >/dev/null
        log "created secret: ${name}"
      fi
    fi
    if [ "$first" = "1" ]; then
      printf '%s' "$entry"
      first=0
    else
      printf ',%s' "$entry"
    fi
  done
}

# ---------------------------------------------------------------------------
# stack.env
# ---------------------------------------------------------------------------

build_stack_env() {
  advertise_addr="$1"
  http_port="${EVCP_HTTP_PORT:-80}"
  # Omit the port for the default HTTP port so the public base URL matches the
  # browser origin and the Keycloak-stamped `iss` claim, which both drop `:80`.
  # A stale `:80` here breaks OIDC: platform-api's exact-match `returnTo` origin
  # check and jose `iss` verification would never match `http://<host>` requests.
  if [ "$http_port" = "80" ]; then
    base_url="http://${advertise_addr}"
  else
    base_url="http://${advertise_addr}:${http_port}"
  fi
  image_repo="${EVCP_IMAGE_REPOSITORY:?EVCP_IMAGE_REPOSITORY is required, e.g. ghcr.io/your-org/evcp}"
  evcp_version="${EVCP_VERSION:-latest}"
  keycloak_realm="${KEYCLOAK_REALM:-evcp}"
  keycloak_platform_client_id="${KEYCLOAK_PLATFORM_CLIENT_ID:-evcp-platform-api}"
  keycloak_admin_client_id="${KEYCLOAK_ADMIN_CLIENT_ID:-evcp-admin-service}"

  cat <<EOF
EVCP_VERSION=${evcp_version}
EVCP_IMAGE_REPOSITORY=${image_repo}
EVCP_CADDY_ADDRESS=:80
EVCP_HTTP_PORT=${http_port}
EVCP_PUBLIC_API_URL=${base_url}/api
EVCP_ADMIN_WEB_URL=${base_url}
EVCP_CREATOR_WEB_URL=${base_url}
EVCP_STORE_WEB_URL=${base_url}
KEYCLOAK_PUBLIC_URL=${base_url}/auth
KEYCLOAK_ISSUER_URL=${base_url}/auth/realms/${keycloak_realm}
KEYCLOAK_REALM=${keycloak_realm}
KEYCLOAK_PLATFORM_CLIENT_ID=${keycloak_platform_client_id}
KEYCLOAK_ADMIN_CLIENT_ID=${keycloak_admin_client_id}
KEYCLOAK_INTERNAL_ISSUER_URL=http://keycloak:8080/auth/realms/${keycloak_realm}
EVCP_S3_PUBLIC_URL=${base_url}
EOF
}

deploy_stack() {
  require_docker
  # The OpenBao token bind mount needs its source file to exist before deploy. Seed a
  # placeholder (real token is written after OpenBao init); never clobber an existing token.
  if [ ! -f "$TOKEN_FILE_HOST" ]; then
    mkdir -p "$(dirname "$TOKEN_FILE_HOST")"
    printf 'pending-openbao-init' > "$TOKEN_FILE_HOST"
    chmod 600 "$TOKEN_FILE_HOST"
  fi
  export OPENBAO_TOKEN_FILE_HOST="$TOKEN_FILE_HOST"
  args="-c ${DOCKER_DIR}/docker-compose.release.yml -c ${DOCKER_DIR}/docker-compose.openbao.yml --with-registry-auth ${STACK_NAME}"
  # docker stack deploy has no --env-file flag; it interpolates ${VAR} references in
  # the compose files from the real process environment, so export stack.env first.
  set -a
  # shellcheck disable=SC1090
  . "$STACK_ENV_PATH"
  # Durability: a UI-set domain (see docs/superpowers/plans/2026-08-02-in-ui-domain.md)
  # is persisted to domain.env alongside stack.env and re-sourced here on every deploy,
  # so redeploys/restarts don't fall back to the IP-first stack.env values.
  # shellcheck disable=SC1090
  [ -f "${STACK_ENV_DIR}/domain.env" ] && . "${STACK_ENV_DIR}/domain.env"
  set +a
  # shellcheck disable=SC2086
  docker stack deploy $args
}

# ---------------------------------------------------------------------------
# openbao subroutine (Step 4)
# ---------------------------------------------------------------------------

openbao_container_id() {
  docker ps --filter "label=com.docker.swarm.service.name=${STACK_NAME}_openbao" --filter "status=running" --format '{{.ID}}' | head -n1
}

wait_for_openbao_container() {
  tries=0
  cid=""
  while [ "$tries" -lt 60 ]; do
    cid=$(openbao_container_id)
    [ -n "$cid" ] && { printf '%s' "$cid"; return 0; }
    tries=$((tries + 1))
    sleep 2
  done
  return 1
}

# Extract a JSON string value: `"field": "value"` (Go's json.MarshalIndent puts the key and
# value on the same line, with a space after the colon). Reads JSON on stdin.
extract_json_string() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -1
}

# Extract a JSON scalar/bareword value: `"field": true` / a number. Reads JSON on stdin.
extract_json_scalar() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\\([A-Za-z0-9._-]*\\).*/\\1/p" | head -1
}

cmd_openbao() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "ERROR: openbao bootstrap requires a live swarm and cannot run in --dry-run." >&2
    exit 1
  fi
  require_docker
  cid=$(wait_for_openbao_container) || { echo "ERROR: openbao service task never became ready." >&2; exit 1; }

  status=$(docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$cid" bao status -format=json 2>/dev/null || echo "")
  initialized=$(printf '%s' "$status" | extract_json_scalar initialized)

  if [ "$initialized" != "true" ]; then
    init_json=$(docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$cid" bao operator init -key-shares=1 -key-threshold=1 -format=json)
    # unseal_keys_b64 is an array — the key is on the line after the field name.
    unseal_key=$(printf '%s' "$init_json" | grep -A1 '"unseal_keys_b64"' | tail -1 | sed 's/[^"]*"\([^"]*\)".*/\1/')
    root_token=$(printf '%s' "$init_json" | extract_json_string root_token)

    docker secret inspect evcp_openbao_unseal >/dev/null 2>&1 \
      || printf '%s' "$unseal_key" | docker secret create evcp_openbao_unseal -
    docker secret inspect evcp_openbao_root >/dev/null 2>&1 \
      || printf '%s' "$root_token" | docker secret create evcp_openbao_root -

    echo "IMPORTANT: move the evcp_openbao_unseal and evcp_openbao_root Docker secrets to" >&2
    echo "your organization's secure secret store now. They are the only way to unseal" >&2
    echo "OpenBao or recover root access — they are not printed again." >&2
  else
    unseal_key=""
    # Already initialized: the root token lives only in the write-only evcp_openbao_root secret,
    # so it cannot be read back. If a prior run failed AFTER init (token file still a placeholder),
    # the operator re-runs with BAO_TOKEN=<root token from the secure store> to finish provisioning.
    root_token="${BAO_TOKEN:-}"
    if [ -z "$root_token" ] && grep -q 'pending-openbao-init' "$TOKEN_FILE_HOST" 2>/dev/null; then
      echo "WARNING: OpenBao is initialized but the workload token was never provisioned." >&2
      echo "Re-run with BAO_TOKEN=<root token from your secure store> to finish." >&2
    fi
  fi

  if [ -n "$unseal_key" ]; then
    docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$cid" bao operator unseal "$unseal_key" >/dev/null 2>&1 || true
  fi

  if [ -n "$root_token" ]; then
    docker exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$root_token" "$cid" bao secrets enable -path=platform kv-v2 >/dev/null 2>&1 || true
    docker exec -i -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$root_token" "$cid" bao policy write evcp-workload - >/dev/null 2>&1 <<'POLICY'
path "platform/data/ai-provider-keys/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
POLICY

    # Mint the workload token (only if the bind-mounted file still holds the placeholder) and
    # write it to the manager file platform-api bind-mounts, then force platform-api to re-read.
    if [ ! -f "$TOKEN_FILE_HOST" ] || grep -q 'pending-openbao-init' "$TOKEN_FILE_HOST" 2>/dev/null; then
      workload_token=$(docker exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN="$root_token" "$cid" bao token create -policy=evcp-workload -orphan -period=8760h -field=token)
      mkdir -p "$(dirname "$TOKEN_FILE_HOST")"
      printf '%s' "$workload_token" > "$TOKEN_FILE_HOST"
      chmod 600 "$TOKEN_FILE_HOST"
      log "wrote OpenBao workload token to ${TOKEN_FILE_HOST}"
      docker service update --force "${STACK_NAME}_platform-api" >/dev/null 2>&1 \
        && log "restarted platform-api to load the OpenBao token" || true
    fi
  fi
}

cmd_unseal() {
  require_docker
  cid=$(wait_for_openbao_container) \
    || { echo "ERROR: openbao service is not running." >&2; exit 1; }

  helper="${STACK_NAME}-unseal-helper"
  docker service rm "$helper" >/dev/null 2>&1 || true
  docker service create --quiet --name "$helper" \
    --secret source=evcp_openbao_unseal,target=unseal_key \
    --restart-condition none \
    --detach=true \
    alpine:3.20 sh -c 'cat /run/secrets/unseal_key' >/dev/null

  tries=0
  unseal_key=""
  while [ "$tries" -lt 30 ]; do
    # Without --raw Docker prefixes each line with the Swarm task name. That prefix
    # corrupts the base64 key and leaves OpenBao sealed after an otherwise-successful
    # release update.
    unseal_key=$(docker service logs --raw "$helper" 2>/dev/null | tr -d '\r\n')
    [ -n "$unseal_key" ] && break
    tries=$((tries + 1))
    sleep 1
  done
  docker service rm "$helper" >/dev/null 2>&1 || true

  [ -n "$unseal_key" ] || { echo "ERROR: could not read evcp_openbao_unseal." >&2; exit 1; }
  docker exec -e BAO_ADDR=http://127.0.0.1:8200 "$cid" bao operator unseal "$unseal_key"
  echo "OpenBao unsealed."
}

# ---------------------------------------------------------------------------
# bootstrap (default) + update commands
# ---------------------------------------------------------------------------

cmd_bootstrap() {
  check_docker_preflight

  advertise_addr=$(detect_advertise_addr)
  if [ -z "$advertise_addr" ]; then
    echo "ERROR: could not detect a primary non-loopback IPv4 address. Set EVCP_ADVERTISE_ADDR." >&2
    exit 1
  fi

  swarm_action=$(swarm_action_plan)
  secrets_json=$(plan_and_create_secrets)
  stack_env_content=$(build_stack_env "$advertise_addr")

  if [ "$DRY_RUN" = "1" ]; then
    stack_env_line=""
    stack_env_first=1
    set -f
    old_ifs=$IFS
    IFS='
'
    for line in $stack_env_content; do
      escaped=$(json_escape "$line")
      if [ "$stack_env_first" = "1" ]; then
        stack_env_line="$escaped"
        stack_env_first=0
      else
        stack_env_line="${stack_env_line}\\n${escaped}"
      fi
    done
    IFS=$old_ifs
    set +f

    printf '{\n'
    printf '  "mode": "dry-run",\n'
    printf '  "advertiseAddr": "%s",\n' "$(json_escape "$advertise_addr")"
    printf '  "swarm": {"action": "%s"},\n' "$(json_escape "$swarm_action")"
    printf '  "secrets": [%s],\n' "$secrets_json"
    printf '  "stackEnvPath": "%s",\n' "$(json_escape "$STACK_ENV_PATH")"
    printf '  "stackEnv": "%s"\n' "$stack_env_line"
    printf '}\n'
    return 0
  fi

  if [ "$swarm_action" = "init" ]; then
    docker swarm init --advertise-addr "$advertise_addr"
  else
    log "swarm: ${swarm_action}"
  fi

  mkdir -p "$STACK_ENV_DIR"
  printf '%s\n' "$stack_env_content" > "$STACK_ENV_PATH"
  chmod 600 "$STACK_ENV_PATH"
  log "wrote ${STACK_ENV_PATH}"

  if [ -n "${EVCP_GHCR_USER:-}" ] && [ -n "${EVCP_GHCR_TOKEN:-}" ]; then
    printf '%s' "$EVCP_GHCR_TOKEN" | docker login ghcr.io -u "$EVCP_GHCR_USER" --password-stdin
  fi

  deploy_stack
  cmd_openbao

  http_port="${EVCP_HTTP_PORT:-80}"
  echo "EVCP is starting at http://${advertise_addr}:${http_port}"
}

cmd_update() {
  new_version="${1:?Usage: bootstrap-swarm.sh update <version>}"

  if [ "$DRY_RUN" = "1" ]; then
    printf '{"mode":"dry-run","action":"update","version":"%s"}\n' "$(json_escape "$new_version")"
    return 0
  fi

  [ -f "$STACK_ENV_PATH" ] || { echo "ERROR: ${STACK_ENV_PATH} not found; run bootstrap-swarm.sh first." >&2; exit 1; }
  require_docker

  tmp_file="${STACK_ENV_PATH}.tmp"
  awk -v v="$new_version" '
    /^EVCP_VERSION=/ { print "EVCP_VERSION=" v; done=1; next }
    { print }
    END { if (!done) print "EVCP_VERSION=" v }
  ' "$STACK_ENV_PATH" > "$tmp_file"
  mv "$tmp_file" "$STACK_ENV_PATH"

  deploy_stack
  # OpenBao uses Shamir sealing and can come back sealed if the stack update or a
  # preceding host restart recreated its task. Restore credential availability
  # before reporting the release update as complete.
  cmd_unseal
  echo "Updated EVCP_VERSION to ${new_version} and redeployed."
}

# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------

main() {
  # Hidden test hooks: extract a field from JSON piped on stdin (used by unit tests to
  # verify the same-line `"key": "value"` parsing that OpenBao's -format=json emits).
  case "${1:-}" in
    __json-string) extract_json_string "$2"; return ;;
    __json-scalar) extract_json_scalar "$2"; return ;;
  esac

  command="bootstrap"
  extra=""
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=1 ;;
      bootstrap|openbao|unseal|update) command="$arg" ;;
      *) extra="${extra} ${arg}" ;;
    esac
  done

  case "$command" in
    bootstrap) cmd_bootstrap ;;
    openbao)
      check_docker_preflight
      cmd_openbao
      ;;
    unseal) cmd_unseal ;;
    # shellcheck disable=SC2086
    update) cmd_update $extra ;;
    *)
      echo "ERROR: unknown command: ${command}" >&2
      exit 1
      ;;
  esac
}

main "$@"
