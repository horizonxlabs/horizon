import { getMockPermissions } from "@evcp/auth-sdk";
import { mockUsers } from "@evcp/mock-data";
import type { PlatformRole } from "@evcp/types";
import { PlatformAuthSsoService, type PlatformAuthClaims, type PlatformAuthSession, type PlatformUser } from "../platform-services";

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
