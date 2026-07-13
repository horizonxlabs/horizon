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

test("rotates once and revokes the complete family when a previous refresh token is reused", async () => {
  const sessions = new Map();
  const repository = {
    createSession: async (session) => sessions.set(session.id, session),
    findById: async (id) => sessions.get(id),
    findByRefreshTokenHash: async (hash) => [...sessions.values()].find((session) => session.refreshTokenHash === hash),
    replaceSession: async ({ previousId, next }) => {
      sessions.get(previousId).replacedBySessionId = next.id;
      sessions.set(next.id, next);
    },
    revokeSession: async (id) => { sessions.get(id).revokedAt = new Date(); },
    revokeSessionFamily: async (familyId) => {
      for (const session of sessions.values()) if (session.sessionFamilyId === familyId) session.revokedAt = new Date();
    },
    revokeUserSessions: async () => {}
  };
  const service = new PlatformSessionService(repository, "test-secret");
  const first = await service.issue({ id: "usr_1", email: "user@example.test" });
  const second = await service.refresh(first.refreshToken);

  await assert.rejects(() => service.refresh(first.refreshToken), (error) => error instanceof PlatformSessionError && error.code === "refresh_token_reused");
  await assert.rejects(() => service.verify(second.token), (error) => error instanceof PlatformSessionError && error.code === "revoked_session");
});
