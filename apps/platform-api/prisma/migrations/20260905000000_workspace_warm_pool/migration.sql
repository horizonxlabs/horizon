ALTER TABLE "workspace_runtime_records"
  ADD COLUMN "resource_key" TEXT;

UPDATE "workspace_runtime_records"
SET "resource_key" = replace("project_id", '_', '-')
WHERE "resource_key" IS NULL;

ALTER TABLE "workspace_runtime_records"
  ALTER COLUMN "resource_key" SET NOT NULL;

CREATE TABLE "workspace_warm_slots" (
  "id" TEXT NOT NULL,
  "resource_key" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "container_id" TEXT,
  "llm_gateway_key_id" TEXT,
  "secret_payload" TEXT,
  "claim_project_id" TEXT,
  "last_error" TEXT,
  "retry_after" TIMESTAMP(3),
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "ready_at" TIMESTAMP(3),
  "claimed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_warm_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_warm_slots_resource_key_key"
  ON "workspace_warm_slots"("resource_key");
CREATE UNIQUE INDEX "workspace_warm_slots_claim_project_id_key"
  ON "workspace_warm_slots"("claim_project_id");
CREATE INDEX "workspace_warm_slots_state_created_at_idx"
  ON "workspace_warm_slots"("state", "created_at");
