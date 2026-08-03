#!/bin/sh
# Export <VAR>=$(cat <VAR>_FILE) for any *_FILE env that points at a Docker secret,
# then exec the real command. Lets images that don't natively read Docker secret
# files (keycloak, litellm) consume them.
#
# Only /run/secrets/* files are inlined. Some base images ship their own *_FILE env
# vars pointing at large files — e.g. litellm sets SSL_CERT_FILE=/etc/ssl/certs/
# ca-certificates.crt (a few hundred KB). Inlining that would push a single env
# value past MAX_ARG_STRLEN (128 KiB), and the next execve fails with E2BIG
# ("Argument list too long"), crash-looping the service. Scoping to the secrets
# mount ignores those image-baked vars while still injecting every real secret.
set -e
for f in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)_FILE=.*/\1/p'); do
  eval "file=\${${f}_FILE}"
  case "$file" in
    /run/secrets/*) [ -f "$file" ] && export "$f=$(cat "$file")" ;;
  esac
done
exec "$@"
