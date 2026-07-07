#!/usr/bin/env bash
set -euo pipefail
# Build the workspace dev image from the repo root so the templates/ context is available.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker build -f docker/workspace-next.Dockerfile -t "${EVCP_WORKSPACE_IMAGE:-evcp/workspace-next:1}" .
echo "built ${EVCP_WORKSPACE_IMAGE:-evcp/workspace-next:1}"
