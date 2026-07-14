CREATE TABLE "ai_execution_jobs" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "payload_ciphertext" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "result" JSONB,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_execution_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_execution_jobs_request_id_key" ON "ai_execution_jobs"("request_id");
CREATE INDEX "ai_execution_jobs_status_available_at_idx" ON "ai_execution_jobs"("status", "available_at");
CREATE INDEX "ai_execution_jobs_lease_expires_at_idx" ON "ai_execution_jobs"("lease_expires_at");
