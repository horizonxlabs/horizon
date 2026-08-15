#!/bin/sh
set -eu

# A fresh workspace volume is mounted with Docker's NoCopy option. Hydrate only source and
# configuration; node_modules remains in the immutable image and is linked below.
template=/opt/evcp-template
if [ ! -f /workspace/package.json ]; then
  tar -C "$template" --exclude='node_modules' -cf - . | tar -C /workspace -xf -
fi
if [ ! -e /workspace/node_modules ]; then
  ln -s /opt/evcp-template/node_modules /workspace/node_modules
fi

# Files the platform injects (tar/exec run as root) drift ownership, which must be repaired
# before running untrusted/generated app code as the non-root user. A blanket chown -R walks
# AND rewrites every node_modules entry on every start and dominated cold-start time; scanning
# with find touches only entries that actually drifted (fallback to the blanket repair if the
# scan itself fails), then privileges drop immediately for the long-lived app process.
find /workspace -xdev ! -user evcp -exec chown evcp:evcp {} + || chown -R evcp:evcp /workspace

exec su -s /bin/sh evcp -c '
  cd /workspace
  # The workspace volume keeps node_modules across stop/start, so skip npm install whenever
  # the manifest is unchanged since the last successful install — a warm start then boots
  # straight into next dev instead of spending tens of seconds re-resolving dependencies.
  stamp=node_modules/.evcp-install-stamp
  sum=$(cat package.json package-lock.json 2>/dev/null | cksum)
  if [ "$(cat "$stamp" 2>/dev/null)" != "$sum" ]; then
    # A changed manifest needs a project-private dependency tree. Replacing the baseline symlink
    # keeps custom dependencies persistent without making every untouched project copy ~660 MB.
    if [ -L node_modules ]; then rm node_modules; fi
    npm install --no-audit --no-fund --prefer-offline >/dev/null 2>&1 &&
      printf "%s" "$sum" > "$stamp" || true
  fi
  exec npm run dev -- --hostname 0.0.0.0 --port 3000 || exec npx next dev --hostname 0.0.0.0 --port 3000
'
