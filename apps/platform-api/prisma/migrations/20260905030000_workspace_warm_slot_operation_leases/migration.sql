ALTER TABLE "workspace_warm_slots"
  ADD COLUMN "operation_owner" TEXT,
  ADD COLUMN "operation_expires_at" TIMESTAMP(3);

CREATE INDEX "workspace_warm_slots_operation_expires_at_idx"
  ON "workspace_warm_slots"("operation_expires_at");
