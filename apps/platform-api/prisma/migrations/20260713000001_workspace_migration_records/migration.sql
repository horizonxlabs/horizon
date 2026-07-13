-- Persist generation-loop migration evidence so publish checks survive an API restart.
CREATE TABLE "workspace_migration_records" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "commit_sha" TEXT NOT NULL,
  "applied_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_migration_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_migration_records_project_id_name_key"
  ON "workspace_migration_records"("project_id", "name");
CREATE INDEX "workspace_migration_records_project_id_applied_at_idx"
  ON "workspace_migration_records"("project_id", "applied_at");

ALTER TABLE "workspace_migration_records"
  ADD CONSTRAINT "workspace_migration_records_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
