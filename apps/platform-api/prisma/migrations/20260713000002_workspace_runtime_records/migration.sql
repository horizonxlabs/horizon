-- Durable lifecycle state for managed workspace containers; secrets remain in encrypted storage.
CREATE TABLE "workspace_runtime_records" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "container_id" TEXT,
  "cpu_cores" INTEGER NOT NULL,
  "memory_mb" INTEGER NOT NULL,
  "llm_gateway_key_id" TEXT,
  "last_activity_at" TIMESTAMP(3) NOT NULL,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_runtime_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_runtime_records_project_id_key"
  ON "workspace_runtime_records"("project_id");
CREATE INDEX "workspace_runtime_records_state_last_activity_at_idx"
  ON "workspace_runtime_records"("state", "last_activity_at");

ALTER TABLE "workspace_runtime_records"
  ADD CONSTRAINT "workspace_runtime_records_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
