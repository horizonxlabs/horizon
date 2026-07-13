export type KeycloakConfig = {
  issuerUrl: string;
  realm: string;
  platformClientId: string;
  platformClientSecret: string;
  adminClientId: string;
  adminClientSecret: string;
  callbackUrl: string;
};

export function readKeycloakConfig(env: Record<string, string | undefined>): KeycloakConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required when Keycloak authentication is enabled`);
    return value;
  };
  const publicApiUrl = required("EVCP_PUBLIC_API_URL").replace(/\/$/, "");

  return {
    issuerUrl: required("KEYCLOAK_ISSUER_URL"),
    realm: required("KEYCLOAK_REALM"),
    platformClientId: required("KEYCLOAK_PLATFORM_CLIENT_ID"),
    platformClientSecret: required("KEYCLOAK_PLATFORM_CLIENT_SECRET"),
    adminClientId: required("KEYCLOAK_ADMIN_CLIENT_ID"),
    adminClientSecret: required("KEYCLOAK_ADMIN_CLIENT_SECRET"),
    callbackUrl: `${publicApiUrl}/auth/keycloak/callback`
  };
}
