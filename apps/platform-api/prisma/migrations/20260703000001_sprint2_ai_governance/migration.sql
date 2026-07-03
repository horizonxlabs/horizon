CREATE TYPE "AiProviderStatus" AS ENUM ('active', 'disabled', 'warning', 'error');
CREATE TYPE "AiUsageMode" AS ENUM ('production', 'development', 'fallback');
CREATE TYPE "GuardrailDecision" AS ENUM ('allow', 'warn', 'block');
CREATE TYPE "GuardrailRuleType" AS ENUM ('keyword', 'regex', 'policy');

CREATE TABLE "ai_providers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "models" TEXT[],
  "status" "AiProviderStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_api_keys" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "usage_mode" "AiUsageMode" NOT NULL,
  "quota_tokens" INTEGER NOT NULL,
  "fallback_priority" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "masked_value" TEXT NOT NULL,
  "secret_ciphertext" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "encryption_provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_scenario_routes" (
  "id" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "primary_provider_id" TEXT NOT NULL,
  "primary_model" TEXT NOT NULL,
  "fallback_provider_id" TEXT,
  "fallback_model" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_scenario_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_quotas" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "daily_limit" INTEGER NOT NULL,
  "monthly_limit" INTEGER NOT NULL,
  "warning_threshold" INTEGER NOT NULL,
  "hard_stop" BOOLEAN NOT NULL DEFAULT true,
  "used_today" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_quotas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardrail_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "GuardrailRuleType" NOT NULL,
  "pattern" TEXT NOT NULL,
  "severity" "AuditSeverity" NOT NULL,
  "action" "GuardrailDecision" NOT NULL,
  "scope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardrail_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guardrail_events" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "decision" "GuardrailDecision" NOT NULL,
  "matched_rule_id" TEXT,
  "matched_rule_name" TEXT,
  "severity" "AuditSeverity" NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardrail_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_api_keys_provider_id_idx" ON "ai_api_keys"("provider_id");
CREATE UNIQUE INDEX "ai_scenario_routes_scenario_key" ON "ai_scenario_routes"("scenario");
CREATE UNIQUE INDEX "ai_quotas_scope_key" ON "ai_quotas"("scope");
CREATE INDEX "guardrail_events_actor_user_id_occurred_at_idx" ON "guardrail_events"("actor_user_id", "occurred_at");
CREATE INDEX "guardrail_events_decision_idx" ON "guardrail_events"("decision");

ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_scenario_routes" ADD CONSTRAINT "ai_scenario_routes_primary_provider_id_fkey" FOREIGN KEY ("primary_provider_id") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardrail_events" ADD CONSTRAINT "guardrail_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardrail_events" ADD CONSTRAINT "guardrail_events_matched_rule_id_fkey" FOREIGN KEY ("matched_rule_id") REFERENCES "guardrail_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
