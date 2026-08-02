#!/bin/sh
# Export <VAR>=$(cat <VAR>_FILE) for any *_FILE env, then exec the real command.
# Lets images that don't natively read Docker secret files (keycloak, litellm) consume them.
set -e
for f in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)_FILE=.*/\1/p'); do
  eval "file=\${${f}_FILE}"
  if [ -f "$file" ]; then export "$f=$(cat "$file")"; fi
done
exec "$@"
