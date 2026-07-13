#!/bin/sh
set -eu

kcadm=/opt/keycloak/bin/kcadm.sh

"$kcadm" config credentials \
  --server http://keycloak:8080 \
  --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"

set_client_secret() {
  client_id=$1
  client_secret=$2
  id=$("$kcadm" get clients -r "$KEYCLOAK_REALM" -q "clientId=$client_id" --fields id --format csv --noquotes)

  if [ -z "$id" ]; then
    echo "Keycloak client $client_id was not imported" >&2
    exit 1
  fi

  "$kcadm" update "clients/$id" -r "$KEYCLOAK_REALM" -s "secret=$client_secret"
}

set_client_secret "$KEYCLOAK_PLATFORM_CLIENT_ID" "$KEYCLOAK_PLATFORM_CLIENT_SECRET"
set_client_secret "$KEYCLOAK_ADMIN_CLIENT_ID" "$KEYCLOAK_ADMIN_CLIENT_SECRET"

platform_client_id=$("$kcadm" get clients -r "$KEYCLOAK_REALM" -q "clientId=$KEYCLOAK_PLATFORM_CLIENT_ID" --fields id --format csv --noquotes)
callback_url="${EVCP_PUBLIC_API_URL%/}/auth/keycloak/callback"
"$kcadm" update "clients/$platform_client_id" -r "$KEYCLOAK_REALM" -s "redirectUris=[\"$callback_url\"]"
