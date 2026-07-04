-- Sprint 9 Auth SSO and Policy Hardening

CREATE TABLE "auth_provider_configs" (
  "id" TEXT NOT NULL,
  "provider_type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "issuer_url" TEXT,
  "entity_id" TEXT,
  "sso_url" TEXT,
  "client_id" TEXT,
  "client_secret_fingerprint" TEXT,
  "certificate_fingerprint" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "group_role_mapping" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_auth_sessions" (
  "id" TEXT NOT NULL,
  "provider_config_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_token_hash" TEXT NOT NULL,
  "claims" JSONB NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "break_glass_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "ticket_ref" TEXT,
  "session_token_hash" TEXT NOT NULL,
  "ttl_minutes" INTEGER NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "break_glass_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_templates" (
  "id" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "required_reviewers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required_checks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publish_allowed" BOOLEAN NOT NULL,
  "external_exposure_allowed" BOOLEAN NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "policy_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_provider_configs_provider_type_status_idx" ON "auth_provider_configs"("provider_type", "status");
CREATE INDEX "platform_auth_sessions_user_id_expires_at_idx" ON "platform_auth_sessions"("user_id", "expires_at");
CREATE INDEX "break_glass_sessions_user_id_issued_at_idx" ON "break_glass_sessions"("user_id", "issued_at");
CREATE UNIQUE INDEX "policy_templates_classification_key" ON "policy_templates"("classification");

ALTER TABLE "auth_provider_configs"
  ADD CONSTRAINT "auth_provider_configs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_auth_sessions"
  ADD CONSTRAINT "platform_auth_sessions_provider_config_id_fkey"
  FOREIGN KEY ("provider_config_id") REFERENCES "auth_provider_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_auth_sessions"
  ADD CONSTRAINT "platform_auth_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "break_glass_sessions"
  ADD CONSTRAINT "break_glass_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "policy_templates"
  ADD CONSTRAINT "policy_templates_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
