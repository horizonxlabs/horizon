import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PlatformSessionError, PlatformSessionService } from "../../apps/platform-api/src/auth/platform-session-service.ts";

const source = readFileSync("apps/platform-api/src/auth/platform-session-service.ts", "utf8");

test("platform session service uses short access tokens, opaque refresh hashes, and reuse revocation", () => {
  assert.match(source, /ACCESS_TOKEN_TTL_SECONDS\s*=\s*15 \* 60/);
  assert.match(source, /REFRESH_TOKEN_TTL_SECONDS\s*=\s*7 \* 24 \* 60 \* 60/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /refresh_token_reused/);
  assert.match(source, /revokeSessionFamily/);
});

test("an immediate duplicate refresh is rejected without revoking the rotated session", async () => {
  const sessions = new Map();
  const repository = {
    createSession: async (session) => sessions.set(session.id, session),
    findById: async (id) => sessions.get(id),
    findByRefreshTokenHash: async (hash) => [...sessions.values()].find((session) => session.refreshTokenHash === hash),
    replaceSession: async ({ previousId, next }) => {
      sessions.get(previousId).replacedBySessionId = next.id;
      sessions.get(previousId).lastUsedAt = new Date();
      sessions.set(next.id, next);
      return true;
    },
    revokeSession: async (id) => { sessions.get(id).revokedAt = new Date(); },
    revokeSessionFamily: async (familyId) => {
      for (const session of sessions.values()) if (session.sessionFamilyId === familyId) session.revokedAt = new Date();
    },
    revokeUserSessions: async () => {}
  };
  const service = new PlatformSessionService(repository, "test-secret");
  const first = await service.issue({
    id: "usr_1", email: "user@example.test", providerConfigId: "authprov_keycloak_default_001",
    claims: { platformRoles: ["creator"] }
  });
  const second = await service.refresh(first.refreshToken);

  await assert.rejects(() => service.refresh(first.refreshToken), (error) => error instanceof PlatformSessionError && error.code === "refresh_token_race");
  assert.equal((await service.verify(second.token)).id, second.sessionId);
});

test("revokes the complete family when a rotated refresh token is replayed after the race window", async () => {
  let now = new Date("2026-09-09T00:00:00.000Z");
  const sessions = new Map();
  const repository = {
    createSession: async (session) => sessions.set(session.id, session),
    findById: async (id) => sessions.get(id),
    findByRefreshTokenHash: async (hash) => [...sessions.values()].find((session) => session.refreshTokenHash === hash),
    replaceSession: async ({ previousId, next }) => {
      sessions.get(previousId).replacedBySessionId = next.id;
      sessions.get(previousId).lastUsedAt = new Date(now);
      sessions.set(next.id, next);
      return true;
    },
    revokeSession: async (id) => { sessions.get(id).revokedAt = new Date(now); },
    revokeSessionFamily: async (familyId) => {
      for (const session of sessions.values()) if (session.sessionFamilyId === familyId) session.revokedAt = new Date(now);
    },
    revokeUserSessions: async () => {}
  };
  const service = new PlatformSessionService(repository, "test-secret", () => new Date(now));
  const first = await service.issue({
    id: "usr_1", email: "user@example.test", providerConfigId: "authprov_keycloak_default_001",
    claims: { platformRoles: ["creator"] }
  });
  const second = await service.refresh(first.refreshToken);
  now = new Date(now.getTime() + 60_000);

  await assert.rejects(() => service.refresh(first.refreshToken), (error) => error instanceof PlatformSessionError && error.code === "refresh_token_reused");
  await assert.rejects(() => service.verify(second.token), (error) => error instanceof PlatformSessionError && error.code === "revoked_session");
});
