import type { CoreRepositoryBackedService } from "../persistence/core-repositories";
import type { AuthResolution, MockAuthService } from "../platform-services";
import type { PlatformSessionService } from "./platform-session-service";

type HeaderBag = Record<string, string | string[] | undefined>;

export async function resolvePersistedAuth(
  services: {
    corePersistence?: CoreRepositoryBackedService;
    platformSessions?: PlatformSessionService;
    auth: MockAuthService;
  },
  headers: HeaderBag
): Promise<AuthResolution> {
  if (!services.corePersistence) throw new Error("Core persistence service is not configured");
  const authorization = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = value?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (services.platformSessions && token) {
    const session = await services.platformSessions.verify(token);
    return {
      user: await services.corePersistence.getUserByEmail(session.email),
      mode: "platform_session",
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString()
    };
  }
  const claims = services.auth.resolveSessionClaims(headers);
  return {
    user: await services.corePersistence.getUserByEmail(claims.email),
    mode: claims.mode,
    sessionId: claims.sessionId,
    expiresAt: claims.expiresAt
  };
}
