-- Sprint 5: Database metadata view and frontend checkpoint restore
ALTER TABLE "projects"
  ADD COLUMN "active_frontend_checkpoint_id" TEXT;

CREATE TABLE "app_database_tables" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'generated',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_database_tables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_database_columns" (
  "id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "data_type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "default_value" TEXT,
  "source" TEXT NOT NULL DEFAULT 'generated',
  "order" INTEGER NOT NULL,

  CONSTRAINT "app_database_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_database_relationships" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_table" TEXT NOT NULL,
  "source_column" TEXT NOT NULL,
  "target_table" TEXT NOT NULL,
  "target_column" TEXT NOT NULL,
  "cardinality" TEXT NOT NULL,

  CONSTRAINT "app_database_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_database_sample_records" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "table_id" TEXT NOT NULL,
  "table_key" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "data" JSONB NOT NULL,

  CONSTRAINT "app_database_sample_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_database_migrations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "migration_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "linked_prd_version" TEXT NOT NULL,
  "linked_frontend_checkpoint" TEXT,
  "applied_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "app_database_migrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "frontend_checkpoints" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "source_preview_version" TEXT NOT NULL,
  "source_task_id" TEXT,
  "status" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "file_manifest" JSONB NOT NULL,
  "route_snapshot" JSONB NOT NULL,
  "change_summary" TEXT NOT NULL,
  "changed_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_user_id" TEXT NOT NULL,
  "restore_source_checkpoint_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "frontend_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_database_tables_project_id_key_key" ON "app_database_tables"("project_id", "key");
CREATE UNIQUE INDEX "app_database_columns_table_id_name_key" ON "app_database_columns"("table_id", "name");
CREATE INDEX "app_database_relationships_project_id_idx" ON "app_database_relationships"("project_id");
CREATE UNIQUE INDEX "app_database_sample_records_table_id_ordinal_key" ON "app_database_sample_records"("table_id", "ordinal");
CREATE INDEX "app_database_sample_records_project_id_idx" ON "app_database_sample_records"("project_id");
CREATE UNIQUE INDEX "app_database_migrations_project_id_migration_id_key" ON "app_database_migrations"("project_id", "migration_id");
CREATE UNIQUE INDEX "frontend_checkpoints_project_id_version_key" ON "frontend_checkpoints"("project_id", "version");
CREATE INDEX "frontend_checkpoints_project_id_status_idx" ON "frontend_checkpoints"("project_id", "status");

ALTER TABLE "app_database_tables"
  ADD CONSTRAINT "app_database_tables_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_database_columns"
  ADD CONSTRAINT "app_database_columns_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "app_database_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_database_relationships"
  ADD CONSTRAINT "app_database_relationships_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_database_sample_records"
  ADD CONSTRAINT "app_database_sample_records_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_database_sample_records"
  ADD CONSTRAINT "app_database_sample_records_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "app_database_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_database_migrations"
  ADD CONSTRAINT "app_database_migrations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "frontend_checkpoints"
  ADD CONSTRAINT "frontend_checkpoints_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
