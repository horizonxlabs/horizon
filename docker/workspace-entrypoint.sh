#!/bin/sh
set -eu

# Docker volume content can retain host ownership. Repair it before running untrusted/generated
# app code, then immediately drop privileges for the long-lived application process.
chown -R evcp:evcp /workspace

exec su -s /bin/sh evcp -c '
  cd /workspace
  npm install --no-audit --no-fund --prefer-offline >/dev/null 2>&1 || true
  exec npm run dev -- --hostname 0.0.0.0 --port 3000 || exec npx next dev --hostname 0.0.0.0 --port 3000
'
