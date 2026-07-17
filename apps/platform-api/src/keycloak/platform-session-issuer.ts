import { getMockPermissions } from "@evcp/auth-sdk";
import { mockUsers } from "@evcp/mock-data";
import type { PlatformRole } from "@evcp/types";
import { PlatformAuthSsoService, type PlatformAuthClaims, type PlatformAuthSession, type PlatformUser } from "../platform-services";
import type { CorePersistenceClient } from "../persistence/core-repositories";
import { upsertKeycloakUserProjection } from "../persistence/keycloak-user-projection";
import type { PlatformSessionService } from "../auth/platform-session-service";

type KeycloakPlatformSession = PlatformAuthSession & {
  refreshToken?: string;
  refreshExpiresAt?: string;
};

declare module "../platform-services" {
  interface PlatformAuthSsoService {
    issueKeycloakSession(claims: PlatformAuthClaims): PlatformAuthSession;
    /**
     * Dual-writes the Keycloak identity into the shared in-memory IdentityService so the
     * synchronous admin-ops routes (which resolve users via `MockAuthService.resolveCurrentUser`)
     * recognise a persistence-mode session. Without this, those routes throw "Unknown mock user"
     * for Keycloak logins because the persistence issuer never touches the mock identity store.
     */
    provisionKeycloakIdentity(claims: PlatformAuthClaims): PlatformUser;
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

PlatformAuthSsoService.prototype.provisionKeycloakIdentity = function provisionKeycloakIdentity(claims) {
  // `identity` is a private field of PlatformAuthSsoService; this prototype augmentation lives
  // outside the class body, so reach it through a structural cast rather than `this.identity`.
  const identity = (this as unknown as { identity: { provisionSsoUser(input: { email: string; name: string; platformRoles: PlatformRole[] }): PlatformUser } }).identity;
  return identity.provisionSsoUser({ email: claims.email, name: claims.name, platformRoles: claims.platformRoles });
};

export function createKeycloakSessionIssuer(input: {
  authSso: PlatformAuthSsoService;
  corePersistenceClient?: CorePersistenceClient;
  platformSessions?: PlatformSessionService;
}): (claims: PlatformAuthClaims) => Promise<KeycloakPlatformSession> {
  return async (claims) => {
    const role = claims.platformRoles[0] as PlatformRole | undefined;
    if (!role) throw new Error("unmapped_keycloak_group");
    // Dual-write into the in-memory identity so the synchronous admin-ops routes recognise this
    // Keycloak session (see provisionKeycloakIdentity). In-memory only, so it is re-established on
    // each login; the persistence projection above remains the source of truth.
    input.authSso.provisionKeycloakIdentity(claims);
    if (input.corePersistenceClient) {
      await upsertKeycloakUserProjection(input.corePersistenceClient, {
        subject: claims.subject, email: claims.email, name: claims.name, role
      });
    }
    if (input.platformSessions && input.corePersistenceClient) {
      const user = await input.corePersistenceClient.platformUser.findUnique({ where: { email: claims.email } });
      if (!user) throw new Error("keycloak_user_projection_missing");
      // Reconcile the in-memory identity id to the persisted platform_users id. The projection
      // upserts by email, so a seeded account (e.g. admin@horizon.ai) keeps its native id, while
      // provisionKeycloakIdentity above minted a divergent usr_sso_* id. Without this, the
      // synchronous admin-ops routes (which resolve users by email via MockAuthService) record the
      // usr_sso_* id, which does not exist in platform_users and violates the knowledge/skill owner
      // foreign keys. registerUser makes both stores agree on the persisted id.
      const identity = (input.authSso as unknown as { identity: { registerUser(user: PlatformUser): PlatformUser } }).identity;
      identity.registerUser({
        id: user.id,
        email: claims.email.trim().toLowerCase(),
        name: claims.name.trim() || claims.email,
        role,
        status: "active",
        permissions: getMockPermissions(role)
      });
      const pair = await input.platformSessions.issue({
        id: user.id,
        email: claims.email,
        providerConfigId: "authprov_keycloak_default_001",
        claims: claims as unknown as Record<string, unknown>
      });
      return {
        id: pair.sessionId,
        providerId: "authprov_keycloak_default_001",
        providerType: "keycloak",
        token: pair.token,
        claims,
        issuedAt: new Date().toISOString(),
        expiresAt: pair.expiresAt,
        refreshToken: pair.refreshToken,
        refreshExpiresAt: pair.refreshExpiresAt
      };
    }
    return input.authSso.issueKeycloakSession(claims);
  };
}
