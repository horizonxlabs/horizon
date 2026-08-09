FROM quay.io/keycloak/keycloak:26.2.5@sha256:4883630ef9db14031cde3e60700c9a9a8eaf1b5c24db1589d6a2d43de38ba2a9

LABEL org.opencontainers.image.title="Horizon Keycloak"

COPY --chown=keycloak:keycloak apps/platform-api/keycloak/themes/horizon /opt/keycloak/themes/horizon
