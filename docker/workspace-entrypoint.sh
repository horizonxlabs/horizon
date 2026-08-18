#!/bin/sh
set -eu

# A fresh workspace volume is mounted with Docker's NoCopy option. Hydrate only source and
# configuration; node_modules remains in the immutable image and is linked below.
template=/opt/evcp-template
if [ ! -f /workspace/package.json ]; then
  tar -C "$template" --exclude='node_modules' -cf - . | tar -C /workspace -xf -
fi
# `-e` dereferences symlinks, so a symlink whose target has gone missing (e.g. after an
# image rebuild moved the template) reads as "does not exist" here even though the path
# itself is occupied — a plain `ln -s` then fails "File exists" and, under set -eu, kills
# the container on every restart. Skip only when node_modules is a real directory (a
# project's persisted custom dependency tree); otherwise (re)point the symlink atomically.
if [ ! -d /workspace/node_modules ] || [ -L /workspace/node_modules ]; then
  ln -sfn /opt/evcp-template/node_modules /workspace/node_modules
fi

# Keep the volume root and Git metadata platform-owned. The sticky parent lets evcp replace its
# own source/runtime entries while preventing it from renaming or deleting root-owned .git.
chown root:root /workspace
chmod 1777 /workspace
if [ -L /workspace/.git ]; then
  echo "refusing symlinked /workspace/.git" >&2
  exit 1
fi
if [ -e /workspace/.git ] && [ ! -d /workspace/.git ]; then
  echo "refusing non-directory /workspace/.git" >&2
  exit 1
fi

# Reject supported-source hard links before changing Git or source ownership. This keeps ownership
# repair read-only on ambiguous inodes, including links shared with protected Git metadata.
find /workspace -xdev \
  \( -path /workspace/.git -o -path /workspace/node_modules -o -path /workspace/.next -o -path '/workspace/.next-*' \) -prune -o \
  -print0 | while IFS= read -r -d '' source_path; do
  if [ -f "$source_path" ] && [ ! -L "$source_path" ]; then
    link_count=$(stat -c %h "$source_path")
    case "$link_count" in
      ''|*[!0-9]*) echo "cannot read workspace source link count: $source_path" >&2; exit 1 ;;
    esac
    if [ "$link_count" -gt 1 ]; then
      echo "supported source hard links are not supported: $source_path" >&2
      exit 1
    fi
  fi
done

if [ -d /workspace/.git ]; then
  chown root:root /workspace/.git
  chmod 700 /workspace/.git
  git_metadata_symlink=$(find /workspace/.git -type l -print -quit)
  if [ -n "$git_metadata_symlink" ]; then
    echo "refusing symlink inside /workspace/.git: $git_metadata_symlink" >&2
    exit 1
  fi
  chown -R root:root /workspace/.git
  chmod -R go-rwx /workspace/.git
  chmod 700 /workspace/.git
fi

# Repair supported source without dereferencing workspace-controlled symlinks. Runtime roots are
# handled only at their top-level entry so a warm restart does not traverse node_modules/.next.
find /workspace -xdev -mindepth 1 \
  \( -path /workspace/.git -o -path /workspace/node_modules -o -path /workspace/.next -o -path '/workspace/.next-*' \) -prune -o \
  ! -user evcp -exec chown -h evcp:evcp {} +
for runtime_entry in /workspace/node_modules /workspace/.next /workspace/.next-*; do
  if [ -e "$runtime_entry" ] || [ -L "$runtime_entry" ]; then
    chown -h evcp:evcp "$runtime_entry"
  fi
done

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
