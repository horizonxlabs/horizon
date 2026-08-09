FROM quay.io/keycloak/keycloak:26.2

LABEL org.opencontainers.image.title="Horizon Keycloak"

COPY --chown=keycloak:keycloak apps/platform-api/keycloak/themes/horizon /opt/keycloak/themes/horizon
