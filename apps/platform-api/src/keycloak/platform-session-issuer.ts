import { getMockPermissions } from "@evcp/auth-sdk";
import { mockUsers } from "@evcp/mock-data";
import type { PlatformRole } from "@evcp/types";
import { PlatformAuthSsoService, type PlatformAuthClaims, type PlatformAuthSession, type PlatformUser } from "../platform-services";
import type { CorePersistenceClient } from "../persistence/core-repositories";
import { upsertKeycloakUserProjection } from "../persistence/keycloak-user-projection";

declare module "../platform-services" {
  interface PlatformAuthSsoService {
    issueKeycloakSession(claims: PlatformAuthClaims): PlatformAuthSession;
  }
}

const systemAdmin: PlatformUser = {
  ...mockUsers.admin,
  status: "active",
  permissions: getMockPermissions("admin" as PlatformRole)
};

PlatformAuthSsoService.prototype.issueKeycloakSession = function issueKeycloakSession(claims) {
  if (!claims.platformRoles.length) throw new Error("unmapped_keycloak_group");
  return this.simulateLogin(systemAdmin, {
    providerId: "authprov_keycloak_default_001",
    subject: claims.subject,
    email: claims.email,
    name: claims.name,
    groups: claims.groups,
    appRoles: claims.appRoles
  });
};

export function createKeycloakSessionIssuer(input: {
  authSso: PlatformAuthSsoService;
  corePersistenceClient?: CorePersistenceClient;
}): (claims: PlatformAuthClaims) => Promise<PlatformAuthSession> {
  return async (claims) => {
    const role = claims.platformRoles[0] as PlatformRole | undefined;
    if (!role) throw new Error("unmapped_keycloak_group");
    if (input.corePersistenceClient) {
      await upsertKeycloakUserProjection(input.corePersistenceClient, {
        subject: claims.subject, email: claims.email, name: claims.name, role
      });
    }
    return input.authSso.issueKeycloakSession(claims);
  };
}
