CREATE TABLE "installer_reports" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "install_blocked" BOOLEAN NOT NULL,
  "report_path" TEXT NOT NULL,
  "checks" JSONB NOT NULL,
  "actionable_failures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "compose_services" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "installer_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "setup_configurations" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "database_url_masked" TEXT NOT NULL,
  "storage_config" JSONB NOT NULL,
  "auth_config" JSONB NOT NULL,
  "ai_config" JSONB NOT NULL,
  "guardrail_config" JSONB NOT NULL,
  "backup_config" JSONB NOT NULL,
  "first_admin_config" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "setup_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_policies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "schedule" TEXT NOT NULL,
  "retention_days" INTEGER NOT NULL,
  "storage_provider" TEXT NOT NULL,
  "storage_config" JSONB NOT NULL,
  "encryption_mode" TEXT NOT NULL,
  "encryption_key_ref" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_runs" (
  "id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "database_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "encrypted" BOOLEAN NOT NULL,
  "artifact_uri" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3) NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pitr_configurations" (
  "id" TEXT NOT NULL,
  "database_name" TEXT NOT NULL,
  "wal_retention_hours" INTEGER NOT NULL,
  "base_backup_run_id" TEXT NOT NULL,
  "target_timestamp" TIMESTAMP(3) NOT NULL,
  "rpo_minutes" INTEGER NOT NULL,
  "rto_minutes" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pitr_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restore_drill_reports" (
  "id" TEXT NOT NULL,
  "backup_run_id" TEXT NOT NULL,
  "pitr_config_id" TEXT NOT NULL,
  "target_timestamp" TIMESTAMP(3) NOT NULL,
  "validation_checks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failed_checks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL,
  "recovery_verified" BOOLEAN NOT NULL,
  "report_path" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restore_drill_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "installer_reports_status_created_at_idx" ON "installer_reports"("status", "created_at");
CREATE INDEX "setup_configurations_domain_status_idx" ON "setup_configurations"("domain", "status");
CREATE INDEX "backup_policies_status_enabled_idx" ON "backup_policies"("status", "enabled");
CREATE INDEX "backup_runs_policy_id_status_started_at_idx" ON "backup_runs"("policy_id", "status", "started_at");
CREATE INDEX "pitr_configurations_database_name_status_idx" ON "pitr_configurations"("database_name", "status");
CREATE INDEX "restore_drill_reports_status_created_at_idx" ON "restore_drill_reports"("status", "created_at");

ALTER TABLE "installer_reports" ADD CONSTRAINT "installer_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "setup_configurations" ADD CONSTRAINT "setup_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "backup_policies" ADD CONSTRAINT "backup_policies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "backup_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pitr_configurations" ADD CONSTRAINT "pitr_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pitr_configurations" ADD CONSTRAINT "pitr_configurations_base_backup_run_id_fkey" FOREIGN KEY ("base_backup_run_id") REFERENCES "backup_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restore_drill_reports" ADD CONSTRAINT "restore_drill_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restore_drill_reports" ADD CONSTRAINT "restore_drill_reports_backup_run_id_fkey" FOREIGN KEY ("backup_run_id") REFERENCES "backup_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restore_drill_reports" ADD CONSTRAINT "restore_drill_reports_pitr_config_id_fkey" FOREIGN KEY ("pitr_config_id") REFERENCES "pitr_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
