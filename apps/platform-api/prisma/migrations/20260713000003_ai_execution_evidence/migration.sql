-- Phase 6: persist idempotent, sanitized governed AI execution evidence.
-- Prompt, completion text, and secret material intentionally do not have columns here.
CREATE TABLE "ai_execution_evidence" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "scenario" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "tokens_used" INTEGER NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  "failure_reason" TEXT,
  "quota_scope" TEXT NOT NULL,
  "quota_tokens_reserved" INTEGER NOT NULL DEFAULT 0,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_execution_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_execution_evidence_request_id_key" ON "ai_execution_evidence"("request_id");
CREATE INDEX "ai_execution_evidence_project_id_occurred_at_idx" ON "ai_execution_evidence"("project_id", "occurred_at");
CREATE INDEX "ai_execution_evidence_actor_user_id_occurred_at_idx" ON "ai_execution_evidence"("actor_user_id", "occurred_at");
