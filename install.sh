#!/bin/sh
# install.sh — one-command EVCP install. Clone the repo, then run:  sudo ./install.sh
# Thin front door over scripts/install/bootstrap-swarm.sh: collects a few non-secret inputs,
# confirms, then hands off. It never generates, prompts for, prints, or stores a secret.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP="$REPO_ROOT/scripts/install/bootstrap-swarm.sh"

ASSUME_YES="${EVCP_INSTALL_ASSUME_YES:-0}"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --version=*) EVCP_VERSION="${arg#*=}" ;;
    --image-repository=*) EVCP_IMAGE_REPOSITORY="${arg#*=}" ;;
    -h|--help)
      echo "Usage: sudo ./install.sh [--yes] [--dry-run] [--version vX.Y.Z] [--image-repository ghcr.io/org]"
      exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ -f "$BOOTSTRAP" ] || { echo "ERROR: run from the repo root (scripts/install/bootstrap-swarm.sh not found)." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker Engine (>= 25) is required." >&2; exit 1; }
if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" != "0" ]; then
  echo "ERROR: run as root:  sudo ./install.sh" >&2; exit 1
fi

ask() { # $1=varname $2=label $3=default $4=secret(0/1)
  eval "_cur=\${$1:-}"; [ -n "${_cur:-}" ] && return 0
  if [ "$ASSUME_YES" = "1" ]; then eval "$1=\"\$3\""; return 0; fi
  if [ "${4:-0}" = "1" ]; then
    printf '%s: ' "$2" >&2; stty -echo 2>/dev/null || true; read -r _v; stty echo 2>/dev/null || true; echo >&2
  else
    if [ -n "$3" ]; then printf '%s [%s]: ' "$2" "$3" >&2; else printf '%s: ' "$2" >&2; fi
    read -r _v
  fi
  [ -z "$_v" ] && _v="$3"
  eval "$1=\"\$_v\""
}

default_repo() {
  _url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || echo '')"
  _org="$(printf '%s' "$_url" | sed -n 's#.*[:/]\([^/]*\)/[^/]*$#\1#p' | tr 'A-Z' 'a-z')"
  [ -n "$_org" ] && echo "ghcr.io/$_org" || echo ""
}
default_version() {
  git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null \
    || git -C "$REPO_ROOT" tag --list 'v*' 2>/dev/null | sort -V | tail -1
}

: "${EVCP_IMAGE_REPOSITORY:=}"
: "${EVCP_VERSION:=}"
ask EVCP_IMAGE_REPOSITORY "Image repository" "$(default_repo)" 0
ask EVCP_VERSION "Version (git tag)" "$(default_version)" 0
[ -n "$EVCP_IMAGE_REPOSITORY" ] || { echo "ERROR: image repository is required." >&2; exit 1; }
[ -n "$EVCP_VERSION" ] || { echo "ERROR: version is required." >&2; exit 1; }

if [ -z "${EVCP_GHCR_USER:-}" ] && [ "$ASSUME_YES" != "1" ]; then
  printf 'Do the images need a private GHCR login? [y/N]: ' >&2; read -r _ans
  case "$_ans" in
    y|Y) ask EVCP_GHCR_USER "GHCR username" "" 0; ask EVCP_GHCR_TOKEN "GHCR token" "" 1 ;;
  esac
fi

{
  echo ""
  echo "EVCP install plan:"
  echo "  image repository : $EVCP_IMAGE_REPOSITORY"
  echo "  version          : $EVCP_VERSION"
  if [ -n "${EVCP_GHCR_USER:-}" ]; then echo "  GHCR login       : yes ($EVCP_GHCR_USER)"; else echo "  GHCR login       : no"; fi
  [ "$DRY_RUN" = "1" ] && echo "  mode             : DRY RUN"
} >&2

if [ "$ASSUME_YES" != "1" ]; then
  printf 'Proceed? [Y/n]: ' >&2; read -r _go
  case "$_go" in n|N) echo "aborted." >&2; exit 1 ;; esac
fi

export EVCP_IMAGE_REPOSITORY EVCP_VERSION
[ -n "${EVCP_GHCR_USER:-}" ] && export EVCP_GHCR_USER || true
[ -n "${EVCP_GHCR_TOKEN:-}" ] && export EVCP_GHCR_TOKEN || true

set --
[ "$DRY_RUN" = "1" ] && set -- --dry-run
exec sh "$BOOTSTRAP" "$@"
