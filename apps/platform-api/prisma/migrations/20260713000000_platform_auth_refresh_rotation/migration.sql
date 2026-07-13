-- Persist Platform Auth session families and refresh-token rotation state.
ALTER TABLE "platform_auth_sessions"
  ADD COLUMN "session_family_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "access_token_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "refresh_token_hash" TEXT,
  ADD COLUMN "refresh_expires_at" TIMESTAMP(3),
  ADD COLUMN "last_used_at" TIMESTAMP(3),
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "revoke_reason" TEXT,
  ADD COLUMN "replaced_by_session_id" TEXT;

UPDATE "platform_auth_sessions"
SET "session_family_id" = "id", "access_token_id" = "id"
WHERE "session_family_id" = '' OR "access_token_id" = '';

ALTER TABLE "platform_auth_sessions"
  ALTER COLUMN "session_family_id" DROP DEFAULT,
  ALTER COLUMN "access_token_id" DROP DEFAULT;

CREATE UNIQUE INDEX "platform_auth_sessions_refresh_token_hash_key"
  ON "platform_auth_sessions"("refresh_token_hash");
CREATE INDEX "platform_auth_sessions_session_family_id_idx"
  ON "platform_auth_sessions"("session_family_id");
