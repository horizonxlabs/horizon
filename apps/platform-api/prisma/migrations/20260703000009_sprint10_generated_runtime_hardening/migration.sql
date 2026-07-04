-- Sprint 10 Generated App Runtime Hardening

CREATE TABLE "generated_app_runtimes" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "deployment_record_id" TEXT NOT NULL,
  "artifact_root" TEXT NOT NULL,
  "required_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "container_name" TEXT NOT NULL,
  "image_tag" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "health_endpoint" TEXT NOT NULL,
  "ready_endpoint" TEXT NOT NULL,
  "metrics_endpoint" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_runtimes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_schema_grants" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "schema_name" TEXT NOT NULL,
  "db_user" TEXT NOT NULL,
  "allowed_schemas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denied_schemas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_schema_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_health_checks" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "health_status" TEXT NOT NULL,
  "readiness_status" TEXT NOT NULL,
  "dependencies" JSONB NOT NULL,
  "readiness_gates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_health_checks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_runtime_logs" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "deployment_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_runtime_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_runtime_metrics" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "request_count" INTEGER NOT NULL,
  "error_count" INTEGER NOT NULL,
  "latency_p95_ms" INTEGER NOT NULL,
  "window" TEXT NOT NULL,
  "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_runtime_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_openapi_contracts" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "openapi_path" TEXT NOT NULL,
  "paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "path_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_openapi_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_app_migration_reports" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "deployment_record_id" TEXT NOT NULL,
  "migration_id" TEXT NOT NULL,
  "dry_run_status" TEXT NOT NULL,
  "destructive_changes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required_approvals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "approval_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generated_app_migration_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_app_runtimes_deployment_record_id_key" ON "generated_app_runtimes"("deployment_record_id");
CREATE INDEX "generated_app_runtimes_app_id_status_idx" ON "generated_app_runtimes"("app_id", "status");
CREATE INDEX "generated_app_runtimes_project_id_idx" ON "generated_app_runtimes"("project_id");
CREATE INDEX "generated_app_schema_grants_schema_name_db_user_idx" ON "generated_app_schema_grants"("schema_name", "db_user");
CREATE INDEX "generated_app_health_checks_runtime_id_checked_at_idx" ON "generated_app_health_checks"("runtime_id", "checked_at");
CREATE INDEX "generated_app_runtime_logs_app_id_deployment_id_idx" ON "generated_app_runtime_logs"("app_id", "deployment_id");
CREATE INDEX "generated_app_runtime_logs_runtime_id_occurred_at_idx" ON "generated_app_runtime_logs"("runtime_id", "occurred_at");
CREATE INDEX "generated_app_runtime_metrics_runtime_id_measured_at_idx" ON "generated_app_runtime_metrics"("runtime_id", "measured_at");
CREATE UNIQUE INDEX "generated_app_openapi_contracts_runtime_id_key" ON "generated_app_openapi_contracts"("runtime_id");
CREATE INDEX "generated_app_migration_reports_deployment_record_id_dry_run_status_idx" ON "generated_app_migration_reports"("deployment_record_id", "dry_run_status");

ALTER TABLE "generated_app_runtimes"
  ADD CONSTRAINT "generated_app_runtimes_app_id_fkey"
  FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_runtimes"
  ADD CONSTRAINT "generated_app_runtimes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_runtimes"
  ADD CONSTRAINT "generated_app_runtimes_deployment_record_id_fkey"
  FOREIGN KEY ("deployment_record_id") REFERENCES "deployment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_schema_grants"
  ADD CONSTRAINT "generated_app_schema_grants_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_health_checks"
  ADD CONSTRAINT "generated_app_health_checks_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_runtime_logs"
  ADD CONSTRAINT "generated_app_runtime_logs_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_runtime_metrics"
  ADD CONSTRAINT "generated_app_runtime_metrics_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_openapi_contracts"
  ADD CONSTRAINT "generated_app_openapi_contracts_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_app_migration_reports"
  ADD CONSTRAINT "generated_app_migration_reports_runtime_id_fkey"
  FOREIGN KEY ("runtime_id") REFERENCES "generated_app_runtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
