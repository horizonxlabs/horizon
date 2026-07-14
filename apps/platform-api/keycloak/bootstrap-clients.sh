#!/bin/sh
set -eu

kcadm=/opt/keycloak/bin/kcadm.sh
keycloak_server=${KEYCLOAK_INTERNAL_ISSUER_URL%/realms/$KEYCLOAK_REALM}

"$kcadm" config credentials \
  --server "$keycloak_server" \
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

admin_client_id=$("$kcadm" get clients -r "$KEYCLOAK_REALM" -q "clientId=$KEYCLOAK_ADMIN_CLIENT_ID" --fields id --format csv --noquotes)
service_account_id=$("$kcadm" get "clients/$admin_client_id/service-account-user" -r "$KEYCLOAK_REALM" --fields id --format csv --noquotes)
for role in query-users view-users manage-users; do
  "$kcadm" add-roles -r "$KEYCLOAK_REALM" --uid "$service_account_id" --cclientid realm-management --rolename "$role"
done

platform_client_id=$("$kcadm" get clients -r "$KEYCLOAK_REALM" -q "clientId=$KEYCLOAK_PLATFORM_CLIENT_ID" --fields id --format csv --noquotes)
callback_url="${EVCP_PUBLIC_API_URL%/}/auth/keycloak/callback"
redirect_uris=$(printf '["%s","%s/*","%s/*","%s/*"]' "$callback_url" "${EVCP_ADMIN_WEB_URL%/}" "${EVCP_CREATOR_WEB_URL%/}" "${EVCP_STORE_WEB_URL%/}")
"$kcadm" update "clients/$platform_client_id" -r "$KEYCLOAK_REALM" -s "redirectUris=$redirect_uris"
# `+` means Keycloak permits the already-validated client redirect URIs for RP-initiated logout.
"$kcadm" update "clients/$platform_client_id" -r "$KEYCLOAK_REALM" -s 'attributes."post.logout.redirect.uris"="+"'
